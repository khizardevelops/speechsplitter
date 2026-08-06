/**
 * Documents to export.
 *
 * Built by running Tier 2 over hand-written gold trees rather than by writing a
 * `ParsedDocument` literal. A literal would drift from the schema silently and
 * would let an exporter be tested against a document the pipeline could never
 * produce. Adapted from the engine repo's `packages/export/test/fixtures.ts`
 * when the mirror test moved here with the split (§V4-71).
 */

import { buildDocument } from "langchunk/grammar";
import type { AnalyzedSentence, ParsedDocument, TokenAnalysis } from "langchunk/schema";

/** `form|UPOS|deprel|head[|FEATS]`, `~` for no preceding space. */
export function parseSpec(...specs: string[]): {
  text: string;
  sentences: AnalyzedSentence[];
} {
  let text = "";
  const sentences: AnalyzedSentence[] = [];

  for (const spec of specs) {
    if (text.length > 0) text += " ";
    const start = text.length;
    const tokens: TokenAnalysis[] = [];
    const fields = spec.trim().split(/\s+/).filter((field) => field.length > 0);

    for (let i = 0; i < fields.length; i++) {
      const raw = fields[i]!;
      const glued = raw.startsWith("~");
      const [form, upos, deprel, head, feats] = (glued ? raw.slice(1) : raw).split("|");
      if (form === undefined || upos === undefined || deprel === undefined || head === undefined) {
        throw new Error(`spec token ${JSON.stringify(raw)} needs form|UPOS|deprel|head`);
      }

      if (i > 0 && !glued) text += " ";
      const tokenStart = text.length;
      text += form;

      tokens.push({
        id: i + 1,
        form,
        span: { start: tokenStart, end: text.length },
        lemma: form.toLowerCase(),
        upos,
        head: Number(head),
        deprel,
        confidence: 1,
        ...(feats !== undefined && feats.length > 0 ? { feats: parseFeats(feats) } : {}),
      });
    }

    sentences.push({ span: { start, end: text.length }, text: text.slice(start), tokens });
  }

  return { text, sentences };
}

function parseFeats(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const equals = pair.indexOf("=");
    if (equals !== -1) out[pair.slice(0, equals)] = pair.slice(equals + 1);
  }
  return out;
}

export function documentFrom(
  code: string,
  ...specs: string[]
): ParsedDocument {
  const { text, sentences } = parseSpec(...specs);
  return buildDocument({
    text,
    sentences,
    language: { code, tier: "dedicated-high", resolution: "declared" },
    analyzer: { id: "spec", version: "fixture" },
  });
}

/** Two sentences, one with a subordinate clause and a merged compound. */
export const ENGLISH = documentFrom(
  "en",
  "I|PRON|nsubj|2 like|VERB|root|0 ice|NOUN|compound|4 cream|NOUN|obj|2",
  // `mark` and `cop` attach to the clause head, which is the predicate
  // adjective `cold` and not the copula — the arrangement UD actually uses.
  "She|PRON|nsubj|2 left|VERB|root|0 because|SCONJ|mark|7 the|DET|det|5 room|NOUN|nsubj|7 was|AUX|cop|7 cold|ADJ|advcl|2",
);

/** Cyrillic, a zero copula, and morphology worth putting on a card. */
export const RUSSIAN = documentFrom(
  "ru",
  "Погода|NOUN|nsubj|3|Case=Nom,Gender=Fem сегодня|ADV|advmod|3 хорошая|ADJ|root|0|Case=Nom,Gender=Fem",
);

/**
 * Every character that breaks a delimited format: a comma, a quote, a tab, and
 * a newline inside a unit.
 */
export const AWKWARD = documentFrom(
  "en",
  'He|PRON|nsubj|2 said|VERB|root|0 ~,|PUNCT|punct|4 "|PUNCT|punct|4 go|VERB|ccomp|2 ~"|PUNCT|punct|2',
);
