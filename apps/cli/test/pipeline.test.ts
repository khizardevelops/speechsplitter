/**
 * End-to-end pipeline tests.
 *
 * Driven by `GoldAnalyzer` rather than `StanzaAnalyzer` on purpose: these assert
 * that the *wiring* is right — language resolution, segmentation, Tier 1, Tier 2,
 * rendering — and mixing in a model's judgement would make a failure ambiguous
 * between "the pipeline is wrong" and "the parser was wrong". It also means the
 * suite needs no Python, so it runs on a clean clone and in CI.
 *
 * `StanzaAnalyzer` has its own tests, which skip when Python is unavailable.
 */

import { describe, expect, it } from "vitest";
import { parseConlluSentences } from "langchunk/conllu";
import { GoldAnalyzer } from "langchunk/analyzers/gold";
import type { Analyzer } from "langchunk/schema";
import { checkIntegrity, parseDocument } from "langchunk/validators";
import { parseText } from "langchunk/pipeline";
import { render } from "../src/render.js";

/** "The dog barked. It ran away quickly." as hand-written gold trees. */
const ENGLISH_CONLLU = `# text = The dog barked.
1\tThe\tthe\tDET\tDT\tDefinite=Def\t2\tdet\t_\t_
2\tdog\tdog\tNOUN\tNN\tNumber=Sing\t3\tnsubj\t_\t_
3\tbarked\tbark\tVERB\tVBD\tTense=Past\t0\troot\t_\tSpaceAfter=No
4\t.\t.\tPUNCT\t.\t_\t3\tpunct\t_\tSpaceAfter=No

# text = It ran away quickly.
1\tIt\tit\tPRON\tPRP\tNumber=Sing\t2\tnsubj\t_\t_
2\tran\trun\tVERB\tVBD\tTense=Past\t0\troot\t_\t_
3\taway\taway\tADV\tRB\t_\t4\tadvmod\t_\t_
4\tquickly\tquickly\tADV\tRB\t_\t2\tadvmod\t_\tSpaceAfter=No
5\t.\t.\tPUNCT\t.\t_\t2\tpunct\t_\tSpaceAfter=No
`;

/** "Погода хорошая." — a zero-copula Russian sentence. */
const RUSSIAN_CONLLU = `# text = Погода хорошая.
1\tПогода\tпогода\tNOUN\tNN\tCase=Nom|Gender=Fem\t2\tnsubj\t_\t_
2\tхорошая\tхороший\tADJ\tJJ\tCase=Nom|Gender=Fem\t0\troot\t_\tSpaceAfter=No
3\t.\t.\tPUNCT\t.\t_\t2\tpunct\t_\tSpaceAfter=No
`;

function goldAnalyzer(conllu: string): GoldAnalyzer {
  return new GoldAnalyzer(parseConlluSentences(conllu), { version: "test" });
}

describe("parseText", () => {
  it("runs the whole pipeline and produces a valid document", async () => {
    const analyzer = goldAnalyzer(ENGLISH_CONLLU);
    const { document } = await parseText({
      text: analyzer.text,
      analyzer,
      lang: "en",
    });

    expect(() => parseDocument(document)).not.toThrow();
    expect(checkIntegrity(document)).toEqual([]);
    expect(document.sentences).toHaveLength(2);
    expect(document.sentences.map((s) => s.text)).toEqual([
      "The dog barked.",
      "It ran away quickly.",
    ]);
    expect(document.clauses.map((c) => c.text)).toEqual([
      "The dog barked",
      "It ran away quickly",
    ]);
    expect(document.phrases.map((p) => `${p.type}:${p.text}`)).toEqual([
      "NP:The dog",
      "AdvP:away quickly",
    ]);
  });

  it("records the analyzer that produced the document", async () => {
    const analyzer = goldAnalyzer(ENGLISH_CONLLU);
    const { document } = await parseText({ text: analyzer.text, analyzer, lang: "en" });
    expect(document.analyzer).toEqual({ id: "gold", version: "test" });
    expect(document.language).toEqual({
      code: "en",
      tier: "dedicated-high",
      resolution: "declared",
    });
  });

  it("keeps every span an exact index into the original text", async () => {
    const analyzer = goldAnalyzer(ENGLISH_CONLLU);
    const { document } = await parseText({ text: analyzer.text, analyzer, lang: "en" });
    const units = [
      ...document.sentences,
      ...document.clauses,
      ...document.phrases,
      ...document.words,
    ];
    expect(units.length).toBeGreaterThan(5);
    for (const unit of units) {
      expect(document.originalText.slice(unit.span.start, unit.span.end)).toBe(unit.text);
    }
  });

  it("detects the language from the script when none is declared", async () => {
    const analyzer = goldAnalyzer(RUSSIAN_CONLLU);
    const { document, pack } = await parseText({ text: analyzer.text, analyzer });
    expect(pack.code).toBe("ru");
    expect(document.language.resolution).toBe("detected");
    // Tier 2 handled a zero-copula predicate with no Russian-specific code.
    expect(document.clauses.map((c) => `${c.type}:${c.text}`)).toEqual([
      "independent:Погода хорошая",
    ]);
  });

  it("parses a language with no pack, honestly — §14 Stage 6", async () => {
    // This used to throw. Refusing was the wrong answer: the analyzer can parse
    // the text, and only the *tuning* is missing. What Stage 6 asks for is that
    // the gap be visible rather than fatal.
    const analyzer = goldAnalyzer(ENGLISH_CONLLU);
    const { document, pack } = await parseText({
      text: analyzer.text,
      analyzer,
      lang: "nl",
    });

    expect(pack.code).toBe("nl");
    expect(document.language.tier).toBe("broad-fallback");
    expect(document.clauses.length).toBeGreaterThan(0);

    // Three ways the output says "do not trust this as much as English", so a
    // reader meets the caveat wherever they happen to be looking.
    expect(document.warnings?.join(" ")).toMatch(/no language pack for nl/);
    expect(document.words.every((word) => word.confidence.score <= 0.6)).toBe(true);
    expect(document.words[0]!.confidence.notes?.join(" ")).toMatch(/broad fallback/);
  });

  it("still refuses when the caller would rather fail than fall back", async () => {
    const analyzer = goldAnalyzer(ENGLISH_CONLLU);
    await expect(
      parseText({ text: analyzer.text, analyzer, lang: "nl", fallback: false }),
    ).rejects.toThrow(/No language pack for "nl"/);
  });

  it("rejects an analyzer that does not support the language", async () => {
    const analyzer: Analyzer = {
      id: "narrow",
      version: "1",
      supports: (lang) => lang === "de",
      analyze: () => Promise.resolve([]),
    };
    await expect(parseText({ text: "Hello there.", analyzer, lang: "en" })).rejects.toThrow(
      /does not support en/,
    );
  });

  it("warns when the segmenter and the analyzer disagree about boundaries", async () => {
    // One sentence of gold annotation, but text the segmenter splits in two.
    const analyzer: Analyzer = {
      id: "stub",
      version: "1",
      supports: () => true,
      analyze: () => Promise.resolve([]),
    };
    const { document } = await parseText({
      text: "One. Two.",
      analyzer,
      lang: "en",
    });
    expect(document.warnings?.join(" ")).toMatch(/disagree about boundaries/);
  });
});

describe("render", () => {
  it("produces valid JSON that round-trips through the validator", async () => {
    const analyzer = goldAnalyzer(ENGLISH_CONLLU);
    const { document } = await parseText({ text: analyzer.text, analyzer, lang: "en" });
    const parsed: unknown = JSON.parse(render(document, "json"));
    expect(() => parseDocument(parsed)).not.toThrow();
  });

  it("prints sentences and their clauses in the simplified view", async () => {
    const analyzer = goldAnalyzer(ENGLISH_CONLLU);
    const { document } = await parseText({ text: analyzer.text, analyzer, lang: "en" });
    const text = render(document, "text");
    expect(text).toContain("The dog barked.");
    expect(text).toContain("[independent] The dog barked");
  });

  it("prints the full hierarchy in the outline view", async () => {
    const analyzer = goldAnalyzer(ENGLISH_CONLLU);
    const { document } = await parseText({ text: analyzer.text, analyzer, lang: "en" });
    const outline = render(document, "outline");
    expect(outline).toContain("SENTENCE");
    expect(outline).toContain("CLAUSE  independent");
    expect(outline).toContain("NP");
    expect(outline).toContain("<- head");
  });

  it("emits no punctuation row in the CoNLL-U view", async () => {
    const analyzer = goldAnalyzer(ENGLISH_CONLLU);
    const { document } = await parseText({ text: analyzer.text, analyzer, lang: "en" });
    const rows = render(document, "conllu")
      .split("\n")
      .filter((line) => line.length > 0 && !line.startsWith("#"));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const columns = row.split("\t");
      expect(columns).toHaveLength(10);
      expect(columns[3]).not.toBe("PUNCT");
    }
  });
});
