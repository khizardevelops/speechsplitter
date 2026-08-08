/**
 * SpeechSplitter production Tier 1 agreement — honest confidence from a second opinion.
 *
 * Every unit LangChunk emits carries a `Confidence`, and until now that number
 * was a lie in the shipped path: Stanza exposes no per-token probability, so
 * `StanzaAnalyzer` reports 1.0 for everything and every clause renders as
 * `high` (`decisions.md` §V4-27). `UpdatedPlan.md` §10 forbids precisely this —
 * *"the system must never emit a confident-looking wrong answer"*.
 *
 * This wraps two independent analyzers. The **primary's** analysis is what comes
 * out; the secondary is consulted only to ask "do you see the same thing?", and
 * the answer sets the confidence.
 *
 * **The numbers are measured, not invented.** `tools/calibrate` runs both
 * analyzers over gold trees and records how often the primary is actually right
 * in each agreement bucket. On English EWT, 4,274 tokens:
 *
 * | bucket | share of tokens | primary is correct |
 * |---|---|---|
 * | `both-agree` | 69.0% | **96.3%** |
 * | `head-differs` | 15.2% | 83.2% |
 * | `no-matching-token` | 9.2% | 87.0% |
 * | `both-differ` | 4.4% | 52.9% |
 * | `relation-differs` | 2.2% | **48.9%** |
 *
 * The ordering is not what intuition suggests, which is the argument for
 * measuring rather than assigning numbers by feel. A **disagreement about the
 * relation is far more damaging than one about the head** — 48.9% against 83.2%.
 * Head disagreements are mostly the weaker analyzer being wrong, while relation
 * disagreements mark genuinely contested attachments, and the relation is what
 * clause and phrase type are read from.
 *
 * A token in the bottom two buckets is close to a coin flip. It must not look
 * like certainty, and now it does not.
 *
 * The cost is one extra parse, so this is opt-in rather than the default.
 */

import type { AnalyzedSentence, Analyzer, Span, TokenAnalysis } from "langchunk/schema";

/** How much the two analyzers agreed about one token. */
export type AgreementBucket =
  /** Same head, same relation. */
  | "both-agree"
  /** Same head, different relation. */
  | "relation-differs"
  /** Same relation, different head. */
  | "head-differs"
  /** Neither matches. */
  | "both-differ"
  /** The secondary never produced a token at this position. */
  | "no-matching-token";

/** P(primary is correct) per bucket. */
export type Calibration = Readonly<Record<AgreementBucket, number>>;

/**
 * Measured on English EWT (`reports/agreement-en.json`).
 *
 * The fallback for a language with no measured table of its own. Re-measure
 * before trusting it — `pnpm run calibrate --lang <code>` — but it is
 * enormously better than the 1.0 it replaces.
 */
export const DEFAULT_CALIBRATION: Calibration = {
  "both-agree": 0.96,
  "head-differs": 0.83,
  "no-matching-token": 0.87,
  "both-differ": 0.53,
  "relation-differs": 0.49,
};

/**
 * Measured per language. `reports/agreement-*.json`.
 *
 * Russian's ceiling is visibly lower — 89.2% where the two agree, against
 * English's 96.3% — and nearly a third of its tokens fall in
 * `no-matching-token` because the two analyzers tokenize Cyrillic very
 * differently. Both are honest reflections of weaker Russian support, and both
 * are exactly the sort of thing a hand-picked constant would have hidden.
 */
export const CALIBRATION: Readonly<Record<string, Calibration>> = {
  en: {
    "both-agree": 0.96,
    "head-differs": 0.83,
    "no-matching-token": 0.87,
    "both-differ": 0.53,
    "relation-differs": 0.49,
  },
  ru: {
    "both-agree": 0.89,
    "head-differs": 0.81,
    "no-matching-token": 0.74,
    "both-differ": 0.48,
    "relation-differs": 0.37,
  },
};

export interface AgreementAnalyzerOptions {
  /** Whose analysis is returned. */
  readonly primary: Analyzer;
  /** Consulted for confidence only; its parse is discarded. */
  readonly secondary: Analyzer;
  /** Per-language calibration, falling back to {@link DEFAULT_CALIBRATION}. */
  readonly calibration?: Readonly<Record<string, Calibration>>;
}

interface SegmentAware extends Analyzer {
  analyzeSegmented(
    text: string,
    spans: readonly Span[],
    lang: string,
  ): Promise<AnalyzedSentence[]>;
}

export class AgreementAnalyzer implements Analyzer {
  readonly id: string;
  readonly version: string;

  readonly #primary: Analyzer;
  readonly #secondary: Analyzer;
  readonly #calibration: Readonly<Record<string, Calibration>>;

  /** Bucket counts from the last analysis, for reporting. */
  readonly counts = new Map<AgreementBucket, number>();

  constructor(options: AgreementAnalyzerOptions) {
    this.#primary = options.primary;
    this.#secondary = options.secondary;
    this.#calibration = options.calibration ?? CALIBRATION;
    this.id = `agreement(${options.primary.id}+${options.secondary.id})`;
    this.version = `${options.primary.version}+${options.secondary.version}`;
  }

  /** Both analyzers must support the language, or there is no second opinion. */
  supports(lang: string): boolean {
    return this.#primary.supports(lang) && this.#secondary.supports(lang);
  }

  async analyze(text: string, lang: string): Promise<AnalyzedSentence[]> {
    return this.analyzeSegmented(text, [{ start: 0, end: text.length }], lang);
  }

  async analyzeSegmented(
    text: string,
    spans: readonly Span[],
    lang: string,
  ): Promise<AnalyzedSentence[]> {
    this.counts.clear();

    const [primary, secondary] = await Promise.all([
      run(this.#primary, text, spans, lang),
      run(this.#secondary, text, spans, lang).catch(() => [] as AnalyzedSentence[]),
    ]);

    const reference = indexByPosition(secondary);
    const calibration = this.#calibration[lang.toLowerCase().split("-")[0] ?? lang]
      ?? DEFAULT_CALIBRATION;

    return primary.map((sentence) => ({
      ...sentence,
      tokens: sentence.tokens.map((token) => {
        const bucket = compare(sentence, token, reference);
        this.counts.set(bucket, (this.counts.get(bucket) ?? 0) + 1);
        return { ...token, confidence: calibration[bucket] };
      }),
    }));
  }
}

async function run(
  analyzer: Analyzer,
  text: string,
  spans: readonly Span[],
  lang: string,
): Promise<AnalyzedSentence[]> {
  const aware = analyzer as SegmentAware;
  return typeof aware.analyzeSegmented === "function"
    ? aware.analyzeSegmented(text, spans, lang)
    : analyzer.analyze(text, lang);
}

interface Observation {
  readonly head: string;
  readonly deprel: string;
}

/**
 * Index by character span rather than token index.
 *
 * Two analyzers rarely tokenize identically — one may split "don't" where the
 * other does not — so positions are the only stable way to ask whether they are
 * talking about the same word. A token the other analyzer never produced is
 * itself a signal, and gets its own bucket.
 */
function indexByPosition(sentences: readonly AnalyzedSentence[]): Map<string, Observation> {
  const map = new Map<string, Observation>();
  for (const sentence of sentences) {
    for (const token of sentence.tokens) {
      map.set(positionKey(token), {
        head: headKey(sentence, token),
        deprel: baseDeprel(token.deprel),
      });
    }
  }
  return map;
}

function compare(
  sentence: AnalyzedSentence,
  token: TokenAnalysis,
  reference: ReadonlyMap<string, Observation>,
): AgreementBucket {
  const other = reference.get(positionKey(token));
  if (other === undefined) return "no-matching-token";

  const headAgrees = other.head === headKey(sentence, token);
  const labelAgrees = other.deprel === baseDeprel(token.deprel);

  if (headAgrees && labelAgrees) return "both-agree";
  if (headAgrees) return "relation-differs";
  if (labelAgrees) return "head-differs";
  return "both-differ";
}

function positionKey(token: TokenAnalysis): string {
  return `${token.span.start}-${token.span.end}`;
}

/** The head identified by *its* position, so it survives differing tokenization. */
function headKey(sentence: AnalyzedSentence, token: TokenAnalysis): string {
  if (token.head === 0) return "ROOT";
  const head = sentence.tokens.find((candidate) => candidate.id === token.head);
  return head === undefined ? "?" : positionKey(head);
}

function baseDeprel(deprel: string): string {
  const colon = deprel.indexOf(":");
  return colon === -1 ? deprel : deprel.slice(0, colon);
}
