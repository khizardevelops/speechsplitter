/**
 * The correction loop — §11.6.
 *
 * The tests that matter here are the ones about what the loop **will not do**.
 * A correction loop that could promote a user report into evidence would
 * recreate the failure §11.3 documents, so the boundary is the feature and it
 * needs to be asserted rather than trusted.
 */

import { describe, expect, it } from "vitest";
import { buildDocument } from "langchunk/grammar";
import type { AnalyzedSentence, ParsedDocument, TokenAnalysis } from "langchunk/schema";
import {
  buildCorrection,
  summarise,
  toFixtureSkeleton,
  triage,
  type Correction,
} from "../src/index.js";

function parseSpec(...specs: string[]): { text: string; sentences: AnalyzedSentence[] } {
  let text = "";
  const sentences: AnalyzedSentence[] = [];
  for (const spec of specs) {
    if (text.length > 0) text += " ";
    const start = text.length;
    const tokens: TokenAnalysis[] = [];
    const fields = spec.trim().split(/\s+/);
    for (let i = 0; i < fields.length; i++) {
      const raw = fields[i]!;
      const glued = raw.startsWith("~");
      const [form, upos, deprel, head] = (glued ? raw.slice(1) : raw).split("|");
      if (i > 0 && !glued) text += " ";
      const tokenStart = text.length;
      text += form!;
      tokens.push({
        id: i + 1,
        form: form!,
        span: { start: tokenStart, end: text.length },
        upos: upos!,
        head: Number(head),
        deprel: deprel!,
        confidence: 1,
      });
    }
    sentences.push({ span: { start, end: text.length }, text: text.slice(start), tokens });
  }
  return { text, sentences };
}

const DOCUMENT: ParsedDocument = (() => {
  const { text, sentences } = parseSpec(
    "I|PRON|nsubj|2 like|VERB|root|0 ice|NOUN|compound|4 cream|NOUN|obj|2",
    "She|PRON|nsubj|2 left|VERB|root|0",
  );
  return buildDocument({
    text,
    sentences,
    language: { code: "en", tier: "dedicated-high", resolution: "declared" },
    analyzer: { id: "stanza", version: "stanza-1.14(en=ewt)" },
  });
})();

const FILED = { id: "c-1", at: "2026-08-05T12:00:00.000Z" };

describe("buildCorrection", () => {
  it("records the unit, the sentence around it, and what produced it", () => {
    const correction = buildCorrection({
      ...FILED,
      document: DOCUMENT,
      unit: "clause",
      unitId: DOCUMENT.clauses[0]!.id,
      kind: "wrong-boundary",
      expected: "I like",
    });

    expect(correction.text).toBe(DOCUMENT.clauses[0]!.text);
    expect(correction.context).toBe(DOCUMENT.sentences[0]!.text);
    expect(correction.language).toBe("en");
    // Without the analyzer version a report is unreproducible: the same text
    // through two model versions is two different parses.
    expect(correction.analyzer.version).toBe("stanza-1.14(en=ewt)");
    expect(correction.expected).toBe("I like");
  });

  it("carries only the sentence, never the whole document", () => {
    // The reader's input may be personal, copyrighted, religious, political, or
    // private — `ProjectInfo.md`'s own list. A report that shipped the entire
    // text would make that decision on their behalf.
    const correction = buildCorrection({
      ...FILED,
      document: DOCUMENT,
      unit: "word",
      unitId: DOCUMENT.words.at(-1)!.id,
      kind: "wrong-word-boundary",
    });

    expect(correction.context).toBe("She left");
    expect(correction.context).not.toContain("ice cream");
  });

  it("rebases the span onto the sentence it ships", () => {
    // Offsets into a document nobody else has are not information.
    const word = DOCUMENT.words.at(-1)!;
    const correction = buildCorrection({
      ...FILED,
      document: DOCUMENT,
      unit: "word",
      unitId: word.id,
      kind: "wrong-word-boundary",
    });

    expect(correction.context.slice(correction.span.start, correction.span.end)).toBe(
      word.text,
    );
  });

  it("refuses an id that is not in the document", () => {
    expect(() =>
      buildCorrection({
        ...FILED,
        document: DOCUMENT,
        unit: "clause",
        unitId: "c-999",
        kind: "other",
      }),
    ).toThrow(/No clause with id/);
  });
});

describe("triage", () => {
  const of = (unit: Correction["unit"], kind: Correction["kind"]): string =>
    triage({ ...FILED, language: "en", analyzer: { id: "x", version: "1" }, unit, kind, text: "", span: { start: 0, end: 0 }, context: "" }).owner;

  it("sends a sentence boundary to the segmenter", () => {
    // Decided before any analysis runs, so neither tier can be at fault.
    expect(of("sentence", "wrong-boundary")).toBe("segmentation");
  });

  it("sends a word boundary to Tier 1", () => {
    // The tokenizer's, or a compound relation's. `known-issues.md` records both.
    expect(of("word", "wrong-word-boundary")).toBe("tier-1");
    expect(of("phrase", "wrong-word-boundary")).toBe("tier-1");
  });

  it("sends a label or a connector to Tier 2", () => {
    // The only reports that are reproducible against a gold tree, and therefore
    // the only ones with a 100% bar rather than a threshold.
    expect(of("phrase", "wrong-type")).toBe("tier-2");
    expect(of("clause", "wrong-connector")).toBe("tier-2");
  });

  it("sends a clause boundary to Tier 1", () => {
    // The boundary comes from the parse. Three of the last three reports of
    // this shape were Tier 1 error that Tier 2 was faithfully reflecting.
    expect(of("clause", "wrong-boundary")).toBe("tier-1");
    expect(of("clause", "missing-unit")).toBe("tier-1");
  });

  it("says it does not know rather than guessing", () => {
    expect(of("phrase", "other")).toBe("unknown");
  });
});

describe("summarise", () => {
  it("counts by owner, kind, and language", () => {
    const make = (
      unit: Correction["unit"],
      kind: Correction["kind"],
      language: string,
    ): Correction => ({
      ...FILED,
      language,
      analyzer: { id: "x", version: "1" },
      unit,
      kind,
      text: "",
      span: { start: 0, end: 0 },
      context: "",
    });

    const report = summarise([
      make("clause", "wrong-boundary", "en"),
      make("clause", "wrong-type", "en"),
      make("sentence", "wrong-boundary", "ru"),
    ]);

    expect(report.total).toBe(3);
    expect(report.byOwner).toEqual({ "tier-1": 1, "tier-2": 1, segmentation: 1 });
    expect(report.byLanguage).toEqual({ en: 2, ru: 1 });
  });
});

describe("toFixtureSkeleton", () => {
  const skeleton = toFixtureSkeleton(
    buildCorrection({
      ...FILED,
      document: DOCUMENT,
      unit: "clause",
      unitId: DOCUMENT.clauses[0]!.id,
      kind: "wrong-type",
      expected: "coordinated",
    }),
  );

  it("leaves the expected output empty", () => {
    // The load-bearing assertion in this file. A correction says what is wrong,
    // not what is right, and filling this in from the parser would recreate the
    // exact failure that made the v2 fixtures worthless (§11.3 rule 2).
    expect(skeleton).toContain("phrases: [], // <- author by hand");
    expect(skeleton).toContain("clauses: [], // <- author by hand");
  });

  it("marks itself unreviewed, so it can never back a coverage claim", () => {
    // The `review` field itself, not the whole string: the instructions above
    // it mention the reviewed status precisely because that is the state the
    // human is being asked to move it to.
    const field = skeleton.split("\n").find((line) => line.trimStart().startsWith("review:"))!;
    expect(field).toContain('status: "unreviewed"');
    expect(field).not.toContain('status: "reviewed"');
  });

  it("records the triage, the reporter's expectation, and the provenance", () => {
    expect(skeleton).toContain("Triage: tier-2");
    expect(skeleton).toContain("They expected");
    expect(skeleton).toContain("stanza-1.14(en=ewt)");
  });

  it("tells the human what to do next, in order", () => {
    expect(skeleton).toContain("TO FINISH THIS FIXTURE");
    expect(skeleton).toContain("Do NOT paste the parser's own tree");
  });
});
