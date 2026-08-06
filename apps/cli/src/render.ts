/**
 * Output formats.
 *
 * `ProjectInfo.md` asks for a simplified view and a detailed view; this is the
 * terminal form of both. The important property is that no renderer invents
 * text — every line is sliced from the original document by span, so what is
 * printed is traceable to what was typed.
 */

import type { ParsedDocument } from "langchunk/schema";
import {
  toAnkiTsv,
  toConllu,
  toCsv,
  toJson,
  toJsonl,
  type AnkiUnit,
} from "langchunk/export";

/**
 * `text` and `outline` are the terminal's own views. The rest come from
 * `langchunk/export`, so the CLI and the web app hand a user the same file —
 * before that package existed the CoNLL-U writer lived here and the CSV writer
 * lived in the frontend, and neither surface could offer what the other had.
 */
export type Format =
  | "text"
  | "outline"
  | "json"
  | "conllu"
  | "csv"
  | "jsonl"
  | "anki"
  | "anki-clauses"
  | "anki-sentences";

export function render(document: ParsedDocument, format: Format): string {
  switch (format) {
    case "json":
      return toJson(document);
    case "conllu":
      return toConllu(document);
    case "csv":
      return toCsv(document);
    case "jsonl":
      return toJsonl(document);
    case "anki":
      return toAnkiTsv(document, { unit: "word" });
    case "anki-clauses":
      return toAnkiTsv(document, { unit: "clause" });
    case "anki-sentences":
      return toAnkiTsv(document, { unit: "sentence" });
    case "outline":
      return renderOutline(document);
    case "text":
      return renderSimplified(document);
  }
}

/** Kept so the switch above stays exhaustive if a unit is ever added. */
export type { AnkiUnit };

/**
 * The simplified view: sentences, and the clauses inside them.
 *
 * `ProjectInfo.md` requires that punctuation not be treated as a word here, and
 * that connectors survive at clause boundaries. Both hold by construction —
 * punctuation never becomes a Word, and `mark`/`cc` sit inside the clause span.
 */
function renderSimplified(document: ParsedDocument): string {
  const clauses = new Map(document.clauses.map((clause) => [clause.id, clause]));
  const lines: string[] = [];

  for (const sentence of document.sentences) {
    lines.push(sentence.text);
    for (const id of sentence.clauseIds) {
      const clause = clauses.get(id);
      if (clause === undefined) continue;
      const label =
        clause.type === "dependent"
          ? `dependent/${clause.dependentRole ?? "?"}`
          : clause.type;
      lines.push(`  - [${label}] ${clause.text}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

/** The detailed view: every unit, nested, with confidence where it is not high. */
function renderOutline(document: ParsedDocument): string {
  const clauses = new Map(document.clauses.map((clause) => [clause.id, clause]));
  const phrases = new Map(document.phrases.map((phrase) => [phrase.id, phrase]));
  const words = new Map(document.words.map((word) => [word.id, word]));
  const lines: string[] = [];

  const note = (confidence: { tier: string; score: number }): string =>
    confidence.tier === "high" ? "" : `  (${confidence.tier} ${confidence.score.toFixed(2)})`;

  for (const sentence of document.sentences) {
    lines.push(`SENTENCE  ${quote(sentence.text)}${note(sentence.confidence)}`);

    for (const id of sentence.clauseIds) {
      const clause = clauses.get(id);
      if (clause === undefined) continue;
      const role = clause.dependentRole !== undefined ? `/${clause.dependentRole}` : "";
      const connector =
        clause.connector !== undefined ? `  connector=${quote(clause.connector.text)}` : "";
      // The subject is worth naming explicitly: it is the thing a learner asks
      // about first, and until schema 4.1 it was unavailable for four clauses in
      // five because most subjects are a single pronoun.
      const subjectWord = clause.subjectWordId !== undefined ? words.get(clause.subjectWordId) : undefined;
      const subjectPhrase =
        clause.subjectPhraseId !== undefined ? phrases.get(clause.subjectPhraseId) : undefined;
      const subject =
        subjectPhrase !== undefined
          ? `  subject=${quote(subjectPhrase.text)}`
          : subjectWord !== undefined
            ? `  subject=${quote(subjectWord.text)}`
            : "";
      // The predicate is always present in the data but only reached the display
      // when it happened to fall inside a phrase, and a VP needs two or more
      // words. A clause like "he walked slowly towards the bridge" showed its
      // prepositional phrases and no verb at all.
      const predicateWord = words.get(clause.predicateWordId);
      const predicate =
        predicateWord !== undefined ? `  predicate=${quote(predicateWord.text)}` : "";
      lines.push(
        `  CLAUSE  ${clause.type}${role}  ${quote(clause.text)}${subject}${predicate}${connector}${note(clause.confidence)}`,
      );

      for (const phraseId of clause.phraseIds) {
        const phrase = phrases.get(phraseId);
        if (phrase === undefined) continue;
        lines.push(`    ${phrase.type.padEnd(5)} ${quote(phrase.text)}${note(phrase.confidence)}`);
        for (const wordId of phrase.wordIds) {
          const word = words.get(wordId);
          if (word === undefined) continue;
          const multiword = word.isMultiword ? `  [${word.multiwordType}]` : "";
          const head = wordId === phrase.headWordId ? "  <- head" : "";
          lines.push(`      ${quote(word.text)}  ${word.upos}${multiword}${head}`);
        }
      }
    }
    lines.push("");
  }

  if (document.warnings !== undefined && document.warnings.length > 0) {
    lines.push(`${document.warnings.length} warning(s):`);
    for (const warning of document.warnings.slice(0, 20)) lines.push(`  ! ${warning}`);
    if (document.warnings.length > 20) {
      lines.push(`  ... and ${document.warnings.length - 20} more`);
    }
  }

  return lines.join("\n").trimEnd();
}

function quote(text: string): string {
  return JSON.stringify(text.replace(/\s+/g, " "));
}
