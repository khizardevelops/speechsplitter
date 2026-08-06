/**
 * @langchunk/corrections — the human correction loop. §11.6.
 *
 * *"Let users flag a wrong parse in the detailed view and route corrections
 * into the fixture set."* Scheduled last in Stage 7, and the ordering is the
 * important part of the specification: **§11.6 must not precede §11.1.** A
 * correction loop that fed the gates directly would let user reports become
 * ground truth, and the project has already been burned by an answer key it did
 * not author (§11.3, and the v2 fixtures that reported 100% F1 on a measurably
 * wrong parser).
 *
 * So the design is deliberately one-directional and stops short:
 *
 *     user flags a unit  ->  a Correction record  ->  a *candidate* fixture,
 *     marked `unreviewed`, which a human then reads and either authors properly
 *     or discards.
 *
 * Nothing here can promote a correction to evidence. `runChecklist` counts only
 * `reviewed` fixtures towards a coverage claim (§11.3 rule 4), so an unreviewed
 * candidate can guard against regression and can never inflate a number.
 *
 * What a correction is worth is not the fixture — it is the *triage*. A report
 * that a clause is wrong is, nine times in ten, a Tier 1 error the taxonomy
 * layer is faithfully reflecting (`known-issues.md`, the Dostoevsky findings:
 * three of five reports were rendering gaps and two were the parse). Recording
 * which tier owns each report is what turns a pile of complaints into a
 * decision about where the next week goes.
 */

import type { ParsedDocument } from "langchunk/schema";

/** Which level the reader was looking at when they flagged something. */
export type CorrectionUnit = "sentence" | "clause" | "phrase" | "word";

/**
 * What the reader says is wrong.
 *
 * A closed list, because free text cannot be counted and counting is the point.
 * Every value maps onto a defect `ProjectInfo.md:233` already names, so a month
 * of reports answers the question that document poses — which of the seven
 * failures is actually happening.
 */
export type CorrectionKind =
  | "wrong-boundary" // the unit starts or ends in the wrong place
  | "missing-unit" // something here should have been a unit and was not
  | "spurious-unit" // this should not be a unit at all
  | "wrong-type" // right span, wrong label: NP for AdjP, adverbial for relative
  | "wrong-connector" // the connector is missing, or is not a connector
  | "wrong-word-boundary" // two words merged that should not be, or vice versa
  | "other";

export interface Correction {
  /** Stable id, so a report can be referenced after it is filed. */
  readonly id: string;
  /** ISO 8601. Supplied by the caller — this package has no clock. */
  readonly at: string;
  readonly language: string;
  /** The analyzer that produced the parse. Without it a report is unreproducible. */
  readonly analyzer: { readonly id: string; readonly version: string };
  readonly unit: CorrectionUnit;
  readonly kind: CorrectionKind;
  /** The exact text the reader was looking at. */
  readonly text: string;
  /** Offsets into `context`, not into the original document. */
  readonly span: { readonly start: number; readonly end: number };
  /** The sentence the unit sat in, which is all a later reader needs. */
  readonly context: string;
  /** What the reader thinks it should have been. Optional and free-form. */
  readonly expected?: string;
  readonly note?: string;
}

export interface CorrectionInput {
  readonly document: ParsedDocument;
  readonly unit: CorrectionUnit;
  readonly unitId: string;
  readonly kind: CorrectionKind;
  readonly expected?: string;
  readonly note?: string;
  /** ISO 8601 timestamp and a unique id, both supplied by the host. */
  readonly at: string;
  readonly id: string;
}

/**
 * Build a correction from a document and the id of the unit that is wrong.
 *
 * The report carries the *sentence*, not the whole document. A reader's input
 * may be personal, copyrighted, religious, political, or private —
 * `ProjectInfo.md`'s own list — and a correction that shipped the entire text
 * would make a privacy decision on their behalf. One sentence is the least that
 * still lets someone else understand the report.
 */
export function buildCorrection(input: CorrectionInput): Correction {
  const { document } = input;
  const unit = findUnit(document, input.unit, input.unitId);
  if (unit === undefined) {
    throw new Error(
      `No ${input.unit} with id ${JSON.stringify(input.unitId)} in this document.`,
    );
  }

  const sentence = sentenceContaining(document, unit.span);
  const context = sentence?.text ?? unit.text;
  const base = sentence?.span.start ?? unit.span.start;

  return {
    id: input.id,
    at: input.at,
    language: document.language.code,
    analyzer: { ...document.analyzer },
    unit: input.unit,
    kind: input.kind,
    text: unit.text,
    // Rebased onto the context, so the record is self-contained: the original
    // document's offsets mean nothing to anyone who does not have the document.
    span: { start: unit.span.start - base, end: unit.span.end - base },
    context,
    ...(input.expected !== undefined && input.expected.length > 0
      ? { expected: input.expected }
      : {}),
    ...(input.note !== undefined && input.note.length > 0 ? { note: input.note } : {}),
  };
}

function findUnit(
  document: ParsedDocument,
  kind: CorrectionUnit,
  id: string,
): { span: { start: number; end: number }; text: string } | undefined {
  switch (kind) {
    case "sentence":
      return document.sentences.find((unit) => unit.id === id);
    case "clause":
      return document.clauses.find((unit) => unit.id === id);
    case "phrase":
      return document.phrases.find((unit) => unit.id === id);
    case "word":
      return document.words.find((unit) => unit.id === id);
  }
}

function sentenceContaining(
  document: ParsedDocument,
  span: { start: number; end: number },
): { span: { start: number; end: number }; text: string } | undefined {
  return document.sentences.find(
    (sentence) => span.start >= sentence.span.start && span.end <= sentence.span.end,
  );
}

// --- triage -----------------------------------------------------------------

/** Which half of the system a report is about. */
export type Owner = "tier-1" | "tier-2" | "segmentation" | "unknown";

export interface Triage {
  readonly owner: Owner;
  readonly reason: string;
}

/**
 * Guess which tier owns a report.
 *
 * A *guess*, and labelled one — the honest answer for most reports needs the
 * gold tree, which is exactly what a user's own text does not have. What this
 * does is sort the pile so the cheap cases are not read one at a time, and the
 * split it draws is the one that mattered every time it has come up before:
 *
 * - a **word or sentence boundary** is decided before Tier 2 runs, by the
 *   tokenizer and the segmenter, so Tier 2 cannot be at fault.
 * - a **type or connector** is Tier 2's own mapping and is checkable against a
 *   gold tree, where the bar is 100%.
 * - a **clause or phrase boundary** is the ambiguous case and usually Tier 1's,
 *   because the boundary comes from the parse. `known-issues.md` records three
 *   of these in a row: gerund subjects, an over-merged compound, and Russian
 *   tokenization — all Tier 1, all faithfully reflected by Tier 2.
 */
export function triage(correction: Correction): Triage {
  if (correction.unit === "sentence") {
    return {
      owner: "segmentation",
      reason:
        "sentence boundaries come from langchunk/segment before any analysis runs; " +
        "check it against Gate 3 and the pack's abbreviation list",
    };
  }

  if (correction.kind === "wrong-word-boundary" || correction.unit === "word") {
    return {
      owner: "tier-1",
      reason:
        "word boundaries come from the analyzer's tokenizer, or from a compound " +
        "relation in the parse; the MWE dictionary can add a merge but cannot undo one",
    };
  }

  if (correction.kind === "wrong-type" || correction.kind === "wrong-connector") {
    return {
      owner: "tier-2",
      reason:
        "labels and connectors are Tier 2's mapping from the parse, so this is " +
        "reproducible against a gold tree — where the bar is 100%, not a threshold",
    };
  }

  if (correction.kind === "wrong-boundary" || correction.kind === "missing-unit") {
    return {
      owner: "tier-1",
      reason:
        "clause and phrase boundaries come from the dependency parse; confirm by " +
        "running the same sentence through the gold analyzer before changing Tier 2",
    };
  }

  return { owner: "unknown", reason: "needs a human to reproduce against a gold tree" };
}

/** Counts per owner and per kind — what a month of reports is actually for. */
export function summarise(corrections: readonly Correction[]): {
  readonly total: number;
  readonly byOwner: Record<string, number>;
  readonly byKind: Record<string, number>;
  readonly byLanguage: Record<string, number>;
} {
  const byOwner: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  const byLanguage: Record<string, number> = {};

  for (const correction of corrections) {
    const owner = triage(correction).owner;
    byOwner[owner] = (byOwner[owner] ?? 0) + 1;
    byKind[correction.kind] = (byKind[correction.kind] ?? 0) + 1;
    byLanguage[correction.language] = (byLanguage[correction.language] ?? 0) + 1;
  }

  return { total: corrections.length, byOwner, byKind, byLanguage };
}

// --- turning a report into something testable --------------------------------

/**
 * Render a correction as a fixture skeleton for a human to finish.
 *
 * **A skeleton, not a fixture**, and the difference is the whole of §11.3. The
 * expected output is left blank because a correction says what is *wrong*, not
 * what is right, and filling it in from the parser would recreate exactly the
 * failure that made the v2 suite worthless. The `review` block says `unreviewed`
 * for the same reason: `runChecklist` counts only `reviewed` fixtures towards a
 * coverage claim, so this can guard against regression and can never become
 * evidence.
 *
 * The spec line is deliberately absent too. A fixture needs a dependency tree,
 * and the only trustworthy source of one is a gold annotation — so the human
 * finishing this has to go and get it, which is the step that makes the fixture
 * worth having.
 */
export function toFixtureSkeleton(correction: Correction): string {
  const triaged = triage(correction);

  return [
    "{",
    `  construction: ${quote(`correction ${correction.id}: ${correction.kind}`)},`,
    `  // Reported ${correction.at} against ${correction.analyzer.id} ` +
      `${correction.analyzer.version}, language ${correction.language}.`,
    `  // The reader flagged this ${correction.unit}: ${quote(correction.text)}`,
    ...(correction.expected !== undefined
      ? [`  // They expected: ${quote(correction.expected)}`]
      : []),
    ...(correction.note !== undefined ? [`  // Note: ${quote(correction.note)}`] : []),
    `  // Triage: ${triaged.owner} — ${triaged.reason}`,
    "  //",
    "  // TO FINISH THIS FIXTURE:",
    "  //  1. Confirm the sentence is grammatical (§11.3 rule 1). Discard it if not.",
    "  //  2. Write the dependency tree by hand, or take it from a gold treebank.",
    "  //     Do NOT paste the parser's own tree — that is the answer key coming",
    "  //     from the thing being graded (§11.3 rule 2).",
    "  //  3. Write the expected phrases and clauses from the sentence, before",
    "  //     running the code against it.",
    "  //  4. Set review to { status: \"reviewed\", reviewer: \"<you>\" }.",
    `  spec: ${quote(correction.context)}, // <- replace with form|UPOS|deprel|head tokens`,
    "  phrases: [], // <- author by hand",
    "  clauses: [], // <- author by hand",
    `  review: { status: "unreviewed", reviewer: ${quote(`report ${correction.id}`)} },`,
    "},",
  ].join("\n");
}

function quote(value: string): string {
  return JSON.stringify(value);
}
