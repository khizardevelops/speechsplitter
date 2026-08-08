/**
 * SpeechSplitter production ONNX Tier 1 on a quantized transformer.
 *
 * docs/UpdatedPlan.md §6.2–§6.3 and §14 Stage 3. Loads a converted
 * `ud-goeswith` model (see `tools/model-convert`) and produces the same
 * `AnalyzedSentence[]` as every other analyzer, so the CLI cannot tell which is
 * loaded. That interchangeability is the whole point of the `Analyzer` boundary.
 *
 * **Why this is not one forward pass.** These models score a *masked* token
 * against every position, so an N-token sentence needs N sequences: in sequence
 * *i*, token *i* is replaced with `[MASK]` and appended at the end. Batched, that
 * produces the N×N arc-score block a dependency tree can be decoded from. Compute
 * is O(N²) in sentence length, which is a real constraint rather than a detail —
 * hence `maxTokens` and `batchSize` below.
 *
 * Currently Node-only: the session is `onnxruntime-node`. Swapping in
 * `onnxruntime-web` is the Stage 4 change and touches only this file, which is
 * why the decode and offset logic live in their own modules.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { AnalyzedSentence, Analyzer, Span, TokenAnalysis } from "langchunk/schema";
import { decodeTree } from "./decode.js";
import { buildByteToCharTable, coversText, spansForPieces } from "./offsets.js";

export interface ModelMeta {
  readonly modelId: string;
  readonly language: string;
  readonly labels: readonly string[];
  readonly clsTokenId: number;
  readonly sepTokenId: number;
  readonly maskTokenId: number;
  readonly goeswithLabelId: number | null;
  readonly rootLabelIds: readonly number[];
  readonly sizes?: { readonly fp32Mb: number; readonly int8Mb: number };
}

export interface OnnxAnalyzerOptions {
  /** Directory holding `model.onnx`, `meta.json`, and the tokenizer files. */
  readonly modelDir: string;
  /**
   * Longest sentence to attempt, in subword tokens. Default 200.
   *
   * Cost is O(N²) in both time and memory: the logits block alone is
   * `N × N × labelCount` floats, which at 200 tokens and a few thousand labels
   * is already hundreds of megabytes. Beyond the limit the sentence is skipped
   * with a warning rather than taking the process down.
   */
  readonly maxTokens?: number;
  /** Sequences per forward pass. Default 32. Caps peak memory. */
  readonly batchSize?: number;
}

interface Session {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array; dims: number[] }>>;
}

export class OnnxAnalyzer implements Analyzer {
  readonly id = "onnx";
  readonly version: string;

  readonly #meta: ModelMeta;
  readonly #session: Session;
  readonly #tokenizer: { tokenize(text: string): string[]; encode(text: string): number[] };
  readonly #maxTokens: number;
  readonly #batchSize: number;
  readonly #tensor: new (type: string, data: BigInt64Array, dims: number[]) => unknown;

  /** Warnings from the last analysis — skipped sentences, tokenizer mismatches. */
  readonly warnings: string[] = [];

  private constructor(
    meta: ModelMeta,
    session: Session,
    tokenizer: { tokenize(text: string): string[]; encode(text: string): number[] },
    tensor: new (type: string, data: BigInt64Array, dims: number[]) => unknown,
    options: OnnxAnalyzerOptions,
  ) {
    this.#meta = meta;
    this.#session = session;
    this.#tokenizer = tokenizer;
    this.#tensor = tensor;
    this.#maxTokens = options.maxTokens ?? 200;
    this.#batchSize = options.batchSize ?? 32;
    this.version = `onnx:${meta.modelId}`;
  }

  /** Load a converted model. `tools/model-convert/convert.py` produces the directory. */
  static async load(options: OnnxAnalyzerOptions): Promise<OnnxAnalyzer> {
    const { modelDir } = options;
    const metaPath = join(modelDir, "meta.json");
    const modelPath = join(modelDir, "model.onnx");

    for (const path of [metaPath, modelPath]) {
      if (!existsSync(path)) {
        throw new Error(
          `OnnxAnalyzer: ${path} is missing. Convert the model first:\n` +
            `  .venv-stanza/bin/python tools/model-convert/convert.py --lang <code>`,
        );
      }
    }

    const meta = JSON.parse(await readFile(metaPath, "utf8")) as ModelMeta;

    const ort = await import("onnxruntime-node");
    const session = (await ort.InferenceSession.create(modelPath, {
      graphOptimizationLevel: "all",
    })) as unknown as Session;

    // transformers.js resolves a bare name against `env.localModelPath` and
    // otherwise reaches for the hub. Point it at the model directory's parent
    // and forbid remote lookups, so the analyzer is genuinely offline once the
    // model is converted — which is the whole premise of the product.
    const { AutoTokenizer, env } = await import("@huggingface/transformers");
    const absolute = resolve(modelDir);
    env.allowRemoteModels = false;
    env.localModelPath = dirname(absolute);
    const tokenizer = (await AutoTokenizer.from_pretrained(
      basename(absolute),
    )) as unknown as {
      tokenize(text: string): string[];
      encode(text: string): number[];
    };

    return new OnnxAnalyzer(
      meta,
      session,
      tokenizer,
      ort.Tensor as unknown as new (t: string, d: BigInt64Array, dims: number[]) => unknown,
      options,
    );
  }

  supports(lang: string): boolean {
    return (lang.toLowerCase().split("-")[0] ?? lang) === this.#meta.language;
  }

  async analyze(text: string, lang: string): Promise<AnalyzedSentence[]> {
    return this.analyzeSegmented(text, [{ start: 0, end: text.length }], lang);
  }

  /** Analyze `text` given sentence boundaries someone else decided (§V4-26). */
  async analyzeSegmented(
    text: string,
    spans: readonly Span[],
    _lang: string,
  ): Promise<AnalyzedSentence[]> {
    this.warnings.length = 0;
    const out: AnalyzedSentence[] = [];

    for (const span of spans) {
      const sentence = text.slice(span.start, span.end);
      if (sentence.trim().length === 0) continue;

      const analyzed = await this.#analyzeSentence(text, span, sentence);
      if (analyzed !== undefined) out.push(analyzed);
    }

    return out;
  }

  async #analyzeSentence(
    text: string,
    span: Span,
    sentence: string,
  ): Promise<AnalyzedSentence | undefined> {
    const pieces = this.#tokenizer.tokenize(sentence);
    if (pieces.length === 0) return undefined;

    if (!coversText(pieces, sentence)) {
      // The tokenizer normalised the text, so byte offsets no longer describe
      // the original string. Emitting spans anyway would be silently wrong.
      this.warnings.push(
        `sentence at ${span.start}: tokenization does not cover the text byte for byte; skipped`,
      );
      return undefined;
    }

    if (pieces.length > this.#maxTokens) {
      this.warnings.push(
        `sentence at ${span.start}: ${pieces.length} tokens exceeds maxTokens=${this.#maxTokens}; ` +
          `skipped (decode is O(N²), see UpdatedPlan.md §13)`,
      );
      return undefined;
    }

    const allIds = this.#tokenizer.encode(sentence).filter((id) => !this.#isSpecial(id));
    if (allIds.length !== pieces.length) {
      this.warnings.push(
        `sentence at ${span.start}: ${allIds.length} ids for ${pieces.length} pieces; skipped`,
      );
      return undefined;
    }

    // Sentence-local spans first, because a token that is nothing but whitespace
    // has to be removed *before* the batch is built — the reference
    // implementation drops zero-width tokens from the input, so keeping one here
    // would shift every prediction by a position.
    const localTable = buildByteToCharTable(sentence);
    const allSpans = spansForPieces(pieces, localTable, sentence);

    const keep: number[] = [];
    for (let i = 0; i < allSpans.length; i++) {
      if (allSpans[i]!.end > allSpans[i]!.start) keep.push(i);
    }
    if (keep.length === 0) return undefined;

    const ids = keep.map((i) => allIds[i]!);
    const localSpans = keep.map((i) => allSpans[i]!);

    const logits = await this.#runMaskBatch(ids);
    const decoded = decodeTree({
      logits,
      tokenCount: ids.length,
      labelCount: this.#meta.labels.length,
      rootLabelIds: this.#meta.rootLabelIds,
      goeswithLabelId: this.#meta.goeswithLabelId ?? undefined,
    });

    const tokens: TokenAnalysis[] = decoded.map((token, index) => {
      const [upos, feats, deprel] = splitLabel(this.#meta.labels[token.labelId] ?? "X|_|dep");
      const local = localSpans[index]!;
      const start = local.start + span.start;
      const end = local.end + span.start;

      return {
        id: index + 1,
        form: text.slice(start, end),
        span: { start, end },
        upos,
        head: token.head === index ? 0 : token.head + 1,
        deprel,
        // The minimum of the two, matching how every other unit in the system
        // aggregates confidence (decisions.md §V4-9): a token whose head is
        // certain and whose relation is a coin flip is not a confident token.
        confidence: Math.min(token.headProbability, token.labelProbability),
        ...(feats !== undefined ? { feats } : {}),
      };
    });

    return { span: { ...span }, text: sentence, tokens };
  }

  #isSpecial(id: number): boolean {
    return (
      id === this.#meta.clsTokenId ||
      id === this.#meta.sepTokenId ||
      id === this.#meta.maskTokenId
    );
  }

  /**
   * Build and run the N masked sequences, returning the N×N×L logit block.
   *
   * Sequence *i* is `[CLS, …, MASK at i, …, SEP, original token i]`. The trailing
   * copy is what lets the model score the masked position against the token that
   * was there, which is the mechanism the whole approach rests on.
   */
  async #runMaskBatch(ids: readonly number[]): Promise<Float32Array> {
    const n = ids.length;
    const { clsTokenId, sepTokenId, maskTokenId, labels } = this.#meta;
    const l = labels.length;

    const base = [clsTokenId, ...ids, sepTokenId];
    const width = base.length + 1;

    const out = new Float32Array(n * n * l);

    for (let from = 0; from < n; from += this.#batchSize) {
      const to = Math.min(from + this.#batchSize, n);
      const rows = to - from;
      const input = new BigInt64Array(rows * width);

      for (let row = 0; row < rows; row++) {
        const target = from + row + 1; // position in `base` of the masked token
        for (let column = 0; column < base.length; column++) {
          const id = column === target ? maskTokenId : base[column]!;
          input[row * width + column] = BigInt(id);
        }
        input[row * width + base.length] = BigInt(base[target]!);
      }

      const feeds = { input_ids: new this.#tensor("int64", input, [rows, width]) };
      const result = await this.#session.run(feeds);
      const logits = result["logits"];
      if (logits === undefined) throw new Error("OnnxAnalyzer: model produced no `logits` output");

      // Drop CLS at the front and SEP plus the appended token at the back, which
      // leaves exactly one column per real token.
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < n; column++) {
          const source = (row * width + column + 1) * l;
          const destination = ((from + row) * n + column) * l;
          out.set(logits.data.subarray(source, source + l), destination);
        }
      }
    }

    return out;
  }
}

/** `NOUN|Number=Sing|nsubj` -> upos, feats, deprel. */
function splitLabel(label: string): [string, Record<string, string> | undefined, string] {
  const parts = label.split("|");
  const upos = parts[0] ?? "X";
  const deprel = parts[parts.length - 1] ?? "dep";
  const middle = parts.slice(1, -1).join("|");

  if (middle === "" || middle === "_") return [upos, undefined, deprel];

  const feats: Record<string, string> = {};
  for (const pair of middle.split("|")) {
    const equals = pair.indexOf("=");
    if (equals > 0) feats[pair.slice(0, equals)] = pair.slice(equals + 1);
  }
  return [upos, Object.keys(feats).length > 0 ? feats : undefined, deprel];
}
