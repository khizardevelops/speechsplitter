/**
 * Agreement-derived confidence.
 *
 * Stub analyzers, no models: what is under test is the comparison logic and the
 * calibration lookup, not any parser. The property that matters most is the one
 * §10 demands — a token the two analyzers disagree about must not come out
 * looking certain.
 */

import { describe, expect, it } from "vitest";
import type { AnalyzedSentence, Analyzer } from "@langchunk/schema";
import { AgreementAnalyzer, DEFAULT_CALIBRATION } from "../src/index.js";

const TEXT = "the dog barked";

/** Tokens at fixed positions, so both stubs describe the same words. */
function sentence(
  spec: ReadonlyArray<{ form: string; start: number; head: number; deprel: string }>,
): AnalyzedSentence {
  return {
    span: { start: 0, end: TEXT.length },
    text: TEXT,
    tokens: spec.map((t, i) => ({
      id: i + 1,
      form: t.form,
      span: { start: t.start, end: t.start + t.form.length },
      upos: "X",
      head: t.head,
      deprel: t.deprel,
      confidence: 1,
    })),
  };
}

function stub(id: string, sentences: AnalyzedSentence[]): Analyzer {
  return {
    id,
    version: "1",
    supports: () => true,
    analyze: () => Promise.resolve(sentences),
  };
}

const BASE = [
  { form: "the", start: 0, head: 2, deprel: "det" },
  { form: "dog", start: 4, head: 3, deprel: "nsubj" },
  { form: "barked", start: 8, head: 0, deprel: "root" },
];

async function confidences(
  secondarySpec: ReadonlyArray<{ form: string; start: number; head: number; deprel: string }>,
): Promise<number[]> {
  const analyzer = new AgreementAnalyzer({
    primary: stub("a", [sentence(BASE)]),
    secondary: stub("b", [sentence(secondarySpec)]),
  });
  const result = await analyzer.analyze(TEXT, "en");
  return result[0]!.tokens.map((t) => t.confidence);
}

describe("AgreementAnalyzer", () => {
  it("returns the primary's analysis unchanged apart from confidence", async () => {
    const analyzer = new AgreementAnalyzer({
      primary: stub("a", [sentence(BASE)]),
      secondary: stub("b", [sentence(BASE)]),
    });
    const [result] = await analyzer.analyze(TEXT, "en");
    expect(result!.tokens.map((t) => t.form)).toEqual(["the", "dog", "barked"]);
    expect(result!.tokens.map((t) => t.head)).toEqual([2, 3, 0]);
    expect(result!.tokens.map((t) => t.deprel)).toEqual(["det", "nsubj", "root"]);
  });

  it("reports high confidence where the two agree completely", async () => {
    expect(await confidences(BASE)).toEqual([
      DEFAULT_CALIBRATION["both-agree"],
      DEFAULT_CALIBRATION["both-agree"],
      DEFAULT_CALIBRATION["both-agree"],
    ]);
  });

  it("lowers confidence where the two disagree about the head", async () => {
    const disagreeing = [
      BASE[0]!,
      { form: "dog", start: 4, head: 1, deprel: "nsubj" },
      BASE[2]!,
    ];
    const scores = await confidences(disagreeing);
    expect(scores[1]).toBe(DEFAULT_CALIBRATION["head-differs"]);
    expect(scores[1]).toBeLessThan(DEFAULT_CALIBRATION["both-agree"]);
    expect(scores[0]).toBe(DEFAULT_CALIBRATION["both-agree"]);
  });

  it("drops confidence to near a coin flip where the RELATION differs", async () => {
    // Measured as the most damaging disagreement of the two — 48.9% against
    // 83.2% — because the relation is what clause and phrase type are read from.
    const disagreeing = [
      BASE[0]!,
      { form: "dog", start: 4, head: 3, deprel: "obj" },
      BASE[2]!,
    ];
    const scores = await confidences(disagreeing);
    expect(scores[1]).toBe(DEFAULT_CALIBRATION["relation-differs"]);
    expect(scores[1]).toBeLessThan(0.6);
  });

  it("handles a token the other analyzer never produced", async () => {
    // Different tokenization is itself information, and gets its own bucket
    // rather than being silently treated as agreement.
    const scores = await confidences([{ form: "the", start: 0, head: 0, deprel: "root" }]);
    expect(scores[1]).toBe(DEFAULT_CALIBRATION["no-matching-token"]);
  });

  it("compares by position, not by token index", async () => {
    // The secondary splits an extra token off the front, shifting every index.
    // Comparing by index would call every token a disagreement.
    const shifted = [
      { form: "the", start: 0, head: 3, deprel: "det" },
      { form: "dog", start: 4, head: 4, deprel: "nsubj" },
      { form: "barked", start: 8, head: 0, deprel: "root" },
    ];
    const analyzer = new AgreementAnalyzer({
      primary: stub("a", [sentence(BASE)]),
      secondary: stub("b", [
        {
          ...sentence(shifted),
          tokens: [
            {
              id: 1,
              form: "",
              span: { start: 0, end: 0 },
              upos: "X",
              head: 0,
              deprel: "dep",
              confidence: 1,
            },
            ...sentence(shifted).tokens.map((t) => ({ ...t, id: t.id + 1 })),
          ],
        },
      ]),
    });
    const [result] = await analyzer.analyze(TEXT, "en");
    expect(result!.tokens[0]!.confidence).toBe(DEFAULT_CALIBRATION["both-agree"]);
  });

  it("supports a language only when both analyzers do", async () => {
    const narrow: Analyzer = {
      id: "narrow",
      version: "1",
      supports: (lang) => lang === "en",
      analyze: () => Promise.resolve([]),
    };
    const wide = stub("wide", []);
    const analyzer = new AgreementAnalyzer({ primary: wide, secondary: narrow });
    expect(analyzer.supports("en")).toBe(true);
    expect(analyzer.supports("ru")).toBe(false);
  });

  it("degrades to the no-match bucket when the secondary fails", async () => {
    // A second opinion that cannot be obtained is not evidence of agreement.
    const failing: Analyzer = {
      id: "broken",
      version: "1",
      supports: () => true,
      analyze: () => Promise.reject(new Error("model unavailable")),
    };
    const analyzer = new AgreementAnalyzer({
      primary: stub("a", [sentence(BASE)]),
      secondary: failing,
    });
    const [result] = await analyzer.analyze(TEXT, "en");
    expect(result!.tokens.every((t) => t.confidence === DEFAULT_CALIBRATION["no-matching-token"])).toBe(true);
  });

  it("counts buckets for reporting", async () => {
    const analyzer = new AgreementAnalyzer({
      primary: stub("a", [sentence(BASE)]),
      secondary: stub("b", [sentence(BASE)]),
    });
    await analyzer.analyze(TEXT, "en");
    expect(analyzer.counts.get("both-agree")).toBe(3);
  });
});
