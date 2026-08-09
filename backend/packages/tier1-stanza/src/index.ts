/**
 * `StanzaAnalyzer` — promotion-compatible Tier 1 runtime.
 *
 * docs/UpdatedPlan.md §7.3. Shells out to Python Stanza and caches the CoNLL-U
 * it returns. **Development and CLI only — never shipped.** Nothing in the
 * browser path may depend on Python, and the ONNX analyzer replaces this in
 * Stage 3.
 *
 * It exists for two reasons: without it there is no way to run the pipeline on
 * text a user actually typed, and in Stage 3 it becomes the baseline the ONNX
 * models are measured against. Both uses want the same property — that swapping
 * analyzers changes nothing else — which is what the `Analyzer` interface buys.
 *
 * The cache is content-addressed and stores CoNLL-U rather than JSON, so it is
 * inspectable with the same tools as a treebank, diffable when a model version
 * changes, and re-usable as a corpus.
 */

import { createHash } from "node:crypto";
import { execFile, spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnalyzedSentence, Analyzer, Span, TokenAnalysis } from "langchunk/schema";
import { parseConlluSentences, parseMisc, syntacticWords } from "langchunk/conllu";
import type { ConlluSentence } from "langchunk/conllu";

const HERE = dirname(fileURLToPath(import.meta.url));

type BridgeProcess = ChildProcessByStdio<Writable, Readable, null>;

export interface StanzaAnalyzerOptions {
  /**
   * Python interpreter. Defaults to `$LANGCHUNK_PYTHON`, then the repository's
   * `.venv-stanza`, then `python3`.
   */
  readonly python?: string;
  /** Directory for cached CoNLL-U. Defaults to `.cache/langchunk/stanza`. */
  readonly cacheDir?: string;
  /** Set false to always re-parse. Default true. */
  readonly cache?: boolean;
  /** Languages this analyzer will claim to support. */
  readonly languages?: readonly string[];
  /**
   * Stanza treebank package per language. Defaults to {@link BEST_PACKAGES}.
   *
   * Stanza trains one model per treebank. Which one to use is an **empirical
   * question per language, not a rule** — see the note on `BEST_PACKAGES`.
   */
  readonly packages?: Readonly<Record<string, StanzaPackage>>;
  /** Milliseconds before a parse is abandoned. Default 300000. */
  readonly timeoutMs?: number;
  /**
   * Keep one Python process alive across calls. Default false.
   *
   * Loading a Stanza pipeline costs several seconds, so the one-shot path makes
   * anything interactive unusable — a REPL would pause for four seconds per
   * line. With this on, the first call pays that cost and the rest are tens of
   * milliseconds. Call {@link StanzaAnalyzer.close} when finished, or the
   * process outlives the work.
   */
  readonly persistent?: boolean;
}

/** A sentence to analyze, with its offset in the original document. */
export interface SentenceInput {
  readonly text: string;
  readonly start: number;
}

/**
 * The package that measured best per language, via Gate 2. Empty means Stanza's
 * own default won.
 *
 * The obvious rule — use the model trained on the treebank you evaluate against —
 * is **wrong**, and measuring is the only way to know:
 *
 * - **Russian**: `taiga` beats the `syntagrus` default by 4.8 word F1 on Taiga
 *   test. SynTagRus is literary and news; Taiga is social media. Domain match
 *   wins here, decisively.
 * - **English**: the `combined` default beats an exact-match `ewt` package on
 *   *EWT test itself* — 85.4 against 84.2 clause F1. Training on EWT plus GUM
 *   and others generalises better than training on EWT alone, even when EWT is
 *   what you are scored on.
 *
 * So there is no rule, only a measurement, and this table records it. Re-measure
 * before changing an entry (`reports/stage3-bakeoff.md` has the method).
 */
export const BEST_PACKAGES: Readonly<Record<string, StanzaPackage>> = {
  // +6.9 clause F1 over the `combined` default (85.4 -> 92.3). The largest
  // single accuracy gain measured in this project. Stanza is a development and
  // CLI tool that is never shipped, so its ~1.3 GB transformer costs disk and
  // time but no bundle budget — the owner's size ceiling does not apply to it.
  en: {
    tokenize: "ewt",
    lemma: "ewt_nocharlm",
    pos: "ewt_electra-large",
    depparse: "ewt_electra-large",
  },
  // +6.0 strict clause F1 over plain `taiga` (69.6 -> 75.6 on Taiga test), the
  // second-largest gain in the project — and a *mixed* pipeline, like English:
  // Taiga's tokenizer with SynTagRus's transformer-backed parser. All three
  // whole-package options measured worse: taiga 69.6, full pavlov-rubert 74.2
  // (its SynTagRus tokenizer costs 1.3 word F1), hybrid 75.6 with word F1 91.7
  // and lenient word 97.5 — the tokens are right, the cross-domain POS tags are
  // the residual cost. `reports/gate2-ru-rubert*.json` hold all three runs.
  //
  // Operational note: the rubert backbone (`DeepPavlov/rubert-base-cased`)
  // ships only a pickle checkpoint, which transformers >= 5 refuses. A fresh
  // machine needs `pip install stanza "transformers<5"`, or a one-time local
  // safetensors conversion of the backbone — see `.agents/known-issues.md`.
  ru: {
    tokenize: "taiga",
    lemma: "taiga_nocharlm",
    pos: "syntagrus_pavlov-rubert",
    depparse: "syntagrus_pavlov-rubert",
  },
};

/**
 * A treebank name, or one name per processor.
 *
 * The map form is needed because Stanza's transformer-backed variants are not
 * available for every processor: `ewt_electra-large` exists for `pos` and
 * `depparse` but not for `tokenize`, so asking for it wholesale fails.
 */
export type StanzaPackage = string | Readonly<Record<string, string>>;

export class StanzaAnalyzer implements Analyzer {
  readonly id = "stanza";
  readonly version: string;

  readonly #python: string;
  readonly #script: string;
  readonly #cacheDir: string;
  readonly #cache: boolean;
  readonly #languages: ReadonlySet<string>;
  readonly #packages: Readonly<Record<string, StanzaPackage>>;
  readonly #timeoutMs: number;
  readonly #persistent: boolean;

  // stderr is inherited so Stanza's progress and warnings reach the terminal
  // directly; only stdin and stdout are pipes we own.
  #server: BridgeProcess | undefined;
  /** Requests are serialised: one line in, one line out, in order. */
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: StanzaAnalyzerOptions = {}) {
    this.#python = options.python ?? defaultPython();
    this.#script = resolve(HERE, "../python/parse.py");
    this.#cacheDir = options.cacheDir ?? join(process.cwd(), ".cache", "langchunk", "stanza");
    this.#cache = options.cache ?? true;
    this.#languages = new Set(options.languages ?? ["en", "ru", "fa", "fr", "de"]);
    this.#packages = options.packages ?? BEST_PACKAGES;
    this.#timeoutMs = options.timeoutMs ?? 300_000;
    this.#persistent = options.persistent ?? false;
    // Stanza's model version is what actually determines the output, but asking
    // for it costs a subprocess start. The package version is close enough for
    // cache keying and is recorded in ParsedDocument.analyzer for provenance.
    const suffix = Object.entries(this.#packages)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([lang, pkg]) => `${lang}=${typeof pkg === "string" ? pkg : Object.values(pkg).join("/")}`)
      .join(",");
    // The package is part of what produced the output, so it belongs in the
    // version string: two runs with different packages are not comparable and
    // must not share a cache key or a recorded provenance.
    this.version = suffix.length > 0 ? `stanza-1.14(${suffix})` : "stanza-1.14";
  }

  supports(lang: string): boolean {
    return this.#languages.has(lang.toLowerCase().split("-")[0] ?? lang);
  }

  /**
   * Analyze a whole document as one sentence.
   *
   * Present to satisfy `Analyzer`. Real callers use {@link analyzeSegmented},
   * because segmentation belongs to `@langchunk/segment` and handing Stanza an
   * unsegmented document would let it decide sentence boundaries too.
   */
  async analyze(text: string, lang: string): Promise<AnalyzedSentence[]> {
    return this.analyzeSegmented(text, [{ start: 0, end: text.length }], lang);
  }

  /**
   * Analyze `text` given sentence boundaries someone else decided.
   *
   * Taking the whole text rather than the sentence strings is what keeps every
   * span an index into the document the user supplied.
   */
  async analyzeSegmented(
    text: string,
    spans: readonly Span[],
    lang: string,
  ): Promise<AnalyzedSentence[]> {
    const wanted: SentenceInput[] = [];
    for (const span of spans) {
      const slice = text.slice(span.start, span.end);
      if (slice.trim().length > 0) wanted.push({ text: slice, start: span.start });
    }
    if (wanted.length === 0) return [];

    const conllu = await this.#conlluFor(wanted, lang);
    return toAnalyzedSentences(parseConlluSentences(conllu), text);
  }

  async #conlluFor(sentences: readonly SentenceInput[], lang: string): Promise<string> {
    const pkg = this.#packages[lang];
    const request = JSON.stringify({
      lang,
      ...(pkg !== undefined ? { package: pkg } : {}),
      sentences: sentences.map((s) => ({ text: s.text, start: s.start })),
    });

    const key = createHash("sha256")
      .update(`${this.version} ${lang} ${request}`)
      .digest("hex");
    const cacheFile = join(this.#cacheDir, `${key}.conllu`);

    if (this.#cache) {
      try {
        return await readFile(cacheFile, "utf8");
      } catch {
        // Cache miss is the normal path, not an error.
      }
    }

    const conllu = await this.#run(request);

    if (this.#cache) {
      await mkdir(this.#cacheDir, { recursive: true });
      await writeFile(cacheFile, conllu, "utf8");
    }
    return conllu;
  }

  /** Shut down the persistent process, if one was started. */
  close(): void {
    this.#server?.stdin.end();
    this.#server?.kill();
    this.#server = undefined;
  }

  #run(request: string): Promise<string> {
    return this.#persistent ? this.#runPersistent(request) : this.#runOnce(request);
  }

  /**
   * Send one request to the long-lived process and read one response line.
   *
   * Serialised through a promise chain because the protocol is strictly
   * request/response over a single pipe: two callers interleaving would each
   * read the other's answer.
   */
  #runPersistent(request: string): Promise<string> {
    const result = this.#queue.then(() => {
      const server = this.#ensureServer();
      return new Promise<string>((resolvePromise, reject) => {
        let buffer = "";

        const cleanup = (): void => {
          server.stdout.off("data", onData);
          server.off("error", onError);
          server.off("exit", onExit);
        };

        const onData = (chunk: Buffer): void => {
          buffer += chunk.toString("utf8");
          const newline = buffer.indexOf("\n");
          if (newline === -1) return;
          cleanup();
          const line = buffer.slice(0, newline);
          try {
            const parsed = JSON.parse(line) as { conllu?: string; error?: string };
            if (parsed.error !== undefined) reject(new Error(`stanza-bridge: ${parsed.error}`));
            else resolvePromise(parsed.conllu ?? "");
          } catch (error) {
            reject(new Error(`stanza-bridge returned unreadable output: ${(error as Error).message}`));
          }
        };

        const onError = (error: Error): void => {
          cleanup();
          this.#server = undefined;
          reject(error);
        };

        const onExit = (code: number | null): void => {
          cleanup();
          this.#server = undefined;
          reject(new Error(`stanza-bridge exited (code ${code ?? "null"}) before answering`));
        };

        server.stdout.on("data", onData);
        server.once("error", onError);
        server.once("exit", onExit);
        server.stdin.write(`${request}\n`);
      });
    });

    // Keep the chain alive even when one request fails, or every later request
    // inherits the rejection.
    this.#queue = result.catch(() => undefined);
    return result;
  }

  #ensureServer(): BridgeProcess {
    if (this.#server !== undefined) return this.#server;
    const server = spawn(this.#python, [this.#script, "--serve"], {
      stdio: ["pipe", "pipe", "inherit"],
    });
    server.stdout.setEncoding("utf8");
    // Do not hold the event loop open on our account; `close()` is the intended
    // shutdown, but forgetting it should not hang the process.
    server.unref();
    this.#server = server;
    return server;
  }

  #runOnce(request: string): Promise<string> {
    return new Promise((resolvePromise, reject) => {
      const child = execFile(
        this.#python,
        [this.#script],
        { maxBuffer: 256 * 1024 * 1024, timeout: this.#timeoutMs },
        (error, stdout, stderr) => {
          if (error) {
            // Parsing never downloads models. A timeout is therefore an actual
            // bridge/model problem rather than first-run provisioning.
            const timedOut =
              (error as NodeJS.ErrnoException).code === "ETIMEDOUT" ||
              (error as { killed?: boolean }).killed === true;
            const hint = timedOut
              ? `The process was killed after ${this.#timeoutMs}ms. Confirm the requested ` +
                "model was provisioned before parsing:\n" +
                "  pnpm run model:download -- --language <language>"
              : "Set LANGCHUNK_PYTHON to an interpreter with stanza installed, or run:\n" +
                "  pnpm run setup:stanza\n" +
                "  pnpm run model:download -- --language <language>";

            reject(
              new Error(
                `StanzaAnalyzer failed (${this.#python} ${this.#script}).\n` +
                  `${stderr.trim() || error.message}\n\n${hint}`,
              ),
            );
            return;
          }
          if (stderr.trim().length > 0) process.stderr.write(stderr);
          resolvePromise(stdout);
        },
      );
      child.stdin?.end(request);
    });
  }
}

function defaultPython(): string {
  const declared = process.env["LANGCHUNK_PYTHON"];
  if (declared !== undefined && declared.length > 0) return declared;

  // Walk up looking for the repository's venv, so the CLI works from any
  // subdirectory without configuration.
  let directory = process.cwd();
  for (let depth = 0; depth < 8; depth++) {
    const candidate = join(directory, ".venv-stanza", "bin", "python");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return "python3";
}

/**
 * Convert the bridge's CoNLL-U into `AnalyzedSentence[]`.
 *
 * Spans come from the `start_char`/`end_char` that Stanza records in MISC, plus
 * the `# base_offset` the bridge writes per sentence. They are therefore exact
 * offsets into the user's original text — including through whatever whitespace
 * or unusual characters it contains, which reconstructing from token forms would
 * only approximate.
 */
export function toAnalyzedSentences(
  sentences: readonly ConlluSentence[],
  originalText: string,
): AnalyzedSentence[] {
  const out: AnalyzedSentence[] = [];

  for (const sentence of sentences) {
    const tokens: TokenAnalysis[] = [];
    let start = Number.POSITIVE_INFINITY;
    let end = 0;

    for (const word of syntacticWords(sentence)) {
      const misc = parseMisc(word);
      const from = Number(misc["start_char"]);
      const to = Number(misc["end_char"]);
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue;

      start = Math.min(start, from);
      end = Math.max(end, to);

      const head = Number(word.head);
      const feats = word.feats === "_" ? undefined : parseFeatureString(word.feats);

      tokens.push({
        id: Number(word.id),
        form: word.form,
        span: { start: from, end: to },
        upos: word.upos === "_" ? "X" : word.upos,
        head: Number.isFinite(head) ? head : 0,
        deprel: word.deprel === "_" ? "dep" : word.deprel,
        // Stanza publishes no per-token probability through this interface.
        // Claiming a number here would be inventing one; §10 forbids emitting a
        // confident-looking answer that has no basis. Gate 2 measures this
        // analyzer's real accuracy instead.
        confidence: 1,
        ...(word.lemma !== "_" ? { lemma: word.lemma } : {}),
        ...(word.xpos !== "_" ? { xpos: word.xpos } : {}),
        ...(feats !== undefined ? { feats } : {}),
      });
    }

    if (tokens.length === 0) continue;
    out.push({
      span: { start, end },
      text: originalText.slice(start, end),
      tokens,
    });
  }

  return out;
}

function parseFeatureString(feats: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const pair of feats.split("|")) {
    const equals = pair.indexOf("=");
    if (equals > 0) out[pair.slice(0, equals)] = pair.slice(equals + 1);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
