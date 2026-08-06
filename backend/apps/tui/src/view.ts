/**
 * The interactive view.
 *
 * Different from the CLI's `--format outline`, and deliberately so: that one is
 * built to be piped, diffed, and grepped, while this one is built to be *read*
 * while you are looking for something wrong. It draws the clause hierarchy as a
 * tree, colours each level differently, and puts the grammatical labels where
 * the eye lands rather than where they are cheapest to print.
 *
 * Nothing here invents text. Every string is sliced from the original input by
 * span, which is the same guarantee the rest of the system makes.
 */

import type { LangClause, ParsedDocument } from "langchunk/schema";
import pc from "picocolors";

const TYPE_COLOUR: Record<string, (text: string) => string> = {
  NP: pc.cyan,
  VP: pc.green,
  PP: pc.yellow,
  AdjP: pc.magenta,
  AdvP: pc.blue,
};

export function renderDocument(document: ParsedDocument): string {
  const clauses = new Map(document.clauses.map((clause) => [clause.id, clause]));
  const phrases = new Map(document.phrases.map((phrase) => [phrase.id, phrase]));
  const words = new Map(document.words.map((word) => [word.id, word]));
  const lines: string[] = [];

  for (const sentence of document.sentences) {
    lines.push(pc.bold(pc.white(sentence.text)));

    const own = sentence.clauseIds
      .map((id) => clauses.get(id))
      .filter((clause): clause is LangClause => clause !== undefined);

    // Nesting is real (a relative clause sits inside its matrix clause), so draw
    // the hierarchy rather than a flat list — it is the thing being explained.
    const children = new Map<string, LangClause[]>();
    const roots: LangClause[] = [];
    for (const clause of own) {
      const parent = clause.parentClauseId;
      if (parent !== undefined && clauses.has(parent)) {
        const bucket = children.get(parent);
        if (bucket) bucket.push(clause);
        else children.set(parent, [clause]);
      } else {
        roots.push(clause);
      }
    }

    const drawClause = (clause: LangClause, prefix: string, last: boolean): void => {
      const elbow = prefix === "" ? "" : last ? "└─ " : "├─ ";
      const label =
        clause.type === "dependent"
          ? `${clause.type}/${clause.dependentRole ?? "?"}`
          : clause.type;

      const parts = [pc.dim(prefix + elbow), pc.bold(colourForClause(clause)(label)), " "];
      parts.push(clause.text);

      const subjectPhrase =
        clause.subjectPhraseId !== undefined ? phrases.get(clause.subjectPhraseId) : undefined;
      const subjectWord =
        clause.subjectWordId !== undefined ? words.get(clause.subjectWordId) : undefined;
      const subject = subjectPhrase?.text ?? subjectWord?.text;
      if (subject !== undefined) parts.push(pc.dim(`   subject: ${subject}`));

      // Name the predicate explicitly.
      //
      // A clause always has one — `predicateWordId` is required by the schema —
      // but it only appeared in the display if it happened to land in a phrase,
      // and a VP needs two or more words. "He walked slowly towards K. bridge"
      // has `slowly` as `advmod` and `bridge` as `obl`, neither of which a VP
      // absorbs, so the VP was one word, was dropped, and the verb vanished from
      // a view that showed three prepositional phrases. The information was
      // never missing, only unrendered.
      const predicate = words.get(clause.predicateWordId);
      if (predicate !== undefined) parts.push(pc.dim(`   predicate: ${predicate.text}`));
      if (clause.connector !== undefined) {
        parts.push(pc.dim(`   connector: ${clause.connector.text}`));
      }
      if (clause.confidence.tier !== "high") {
        parts.push(pc.red(`   ${clause.confidence.tier}`));
      }
      lines.push(parts.join(""));

      const childPrefix = prefix === "" ? "  " : prefix + (last ? "   " : "│  ");

      for (const phraseId of clause.phraseIds) {
        const phrase = phrases.get(phraseId);
        if (phrase === undefined) continue;
        const colour = TYPE_COLOUR[phrase.type] ?? pc.white;
        const members = phrase.wordIds
          .map((id) => {
            const word = words.get(id);
            if (word === undefined) return "";
            const text = id === phrase.headWordId ? pc.underline(word.text) : word.text;
            return word.isMultiword ? `${text}${pc.dim("*")}` : text;
          })
          .filter((part) => part.length > 0)
          .join(pc.dim(" · "));
        lines.push(
          `${pc.dim(childPrefix + "  ")}${colour(phrase.type.padEnd(4))} ${members}`,
        );
      }

      const kids = children.get(clause.id) ?? [];
      kids.forEach((child, index) =>
        drawClause(child, childPrefix, index === kids.length - 1),
      );
    };

    roots.forEach((clause, index) => drawClause(clause, "", index === roots.length - 1));
    lines.push("");
  }

  if (document.warnings !== undefined && document.warnings.length > 0) {
    for (const warning of document.warnings.slice(0, 5)) {
      lines.push(pc.yellow(`! ${warning}`));
    }
  }

  return lines.join("\n");
}

function colourForClause(clause: LangClause): (text: string) => string {
  if (clause.type === "independent") return pc.green;
  if (clause.type === "coordinated") return pc.cyan;
  return pc.yellow;
}

/** A one-line summary of what the analysis found. */
export function summarise(document: ParsedDocument, elapsedMs: number): string {
  const counts = [
    `${document.sentences.length} sentence${plural(document.sentences.length)}`,
    `${document.clauses.length} clause${plural(document.clauses.length)}`,
    `${document.phrases.length} phrase${plural(document.phrases.length)}`,
    `${document.words.length} word${plural(document.words.length)}`,
  ].join(", ");
  return pc.dim(`${counts}  ·  ${elapsedMs} ms`);
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

/** The legend, so the colours mean something without reading the source. */
export function legend(): string {
  return [
    pc.dim("clauses  ") +
      pc.green("independent") +
      pc.dim("  ") +
      pc.cyan("coordinated") +
      pc.dim("  ") +
      pc.yellow("dependent"),
    pc.dim("phrases  ") +
      pc.cyan("NP") +
      pc.dim("  ") +
      pc.green("VP") +
      pc.dim("  ") +
      pc.yellow("PP") +
      pc.dim("  ") +
      pc.magenta("AdjP") +
      pc.dim("  ") +
      pc.blue("AdvP"),
    pc.dim("words    ") + pc.underline("head") + pc.dim("   multi-word unit marked *"),
  ].join("\n");
}
