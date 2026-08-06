/**
 * MIRROR of `packages/export/src/jsonl.ts`. Change that file first.
 *
 * The frontend installs with bun outside the pnpm workspace and must not import
 * from it (§8), so the JSON Lines writer exists twice. Two copies are
 * permitted; two *behaviours* are not, and
 * `packages/export/test/frontend-mirror.test.ts` runs both over the same
 * documents and fails the build if they ever disagree.
 *
 * ---
 *
 * The analysis as JSON Lines: four entries, one per level.
 *
 * The same shape as the CSV — sentences, clauses, phrases, words, each with its
 * own list — for a reader who wants to pipe it rather than open it in a
 * spreadsheet. One line per level, four lines in total:
 *
 *     {"level":"sentences","count":1,"values":["The dog barked and the cat slept."]}
 *     {"level":"clauses","count":2,"values":["The dog barked","and the cat slept"]}
 *     {"level":"phrases","count":1,"values":["The dog"]}
 *     {"level":"words","count":7,"values":["The","dog","barked","and","the","cat","slept"]}
 *
 * **Four lines, not one line per unit.** The denormalised shape — a row per
 * word, repeating the sentence and clause it belongs to — was tried for the CSV
 * and was unusable: on a page of Dostoevsky it produced 210 rows for 16
 * sentences with 61% of the file being one sentence restated. JSON Lines would
 * suffer it no better, and the JSON export already carries the full hierarchy
 * with ids, offsets and confidence for anyone who wants it.
 *
 * Why offer it at all when the CSV carries the same information: JSON Lines
 * survives every character a text can contain without an escaping convention
 * anyone has to agree on, and it is streamable. A comma inside a sentence needs
 * quoting rules in CSV and needs nothing here.
 */

import type { ParsedDocument } from './types';

/** The four levels, outermost first — the order the CSV's columns run in. */
export type JsonlLevel = 'sentences' | 'clauses' | 'phrases' | 'words';

export interface JsonlEntry {
	readonly level: JsonlLevel;
	/** `values.length`, so a truncated file is detectable without counting. */
	readonly count: number;
	/** Every unit at this level, in document order, as it appears in the text. */
	readonly values: readonly string[];
}

/** The four entries, before they are serialised. */
export function toJsonlEntries(document: ParsedDocument): JsonlEntry[] {
	const levels: ReadonlyArray<readonly [JsonlLevel, ReadonlyArray<{ text: string }>]> = [
		['sentences', document.sentences],
		['clauses', document.clauses],
		['phrases', document.phrases],
		['words', document.words]
	];

	return levels.map(([level, units]) => {
		const values = units.map((unit) => collapse(unit.text));
		return { level, count: values.length, values };
	});
}

/**
 * The four entries as a JSON Lines file.
 *
 * Newline-terminated rather than newline-separated: `wc -l` and every
 * line-oriented tool count the last record correctly, and appending another
 * file needs no fixing up. That is the convention JSON Lines actually uses,
 * whatever the name suggests.
 */
export function toJsonl(document: ParsedDocument): string {
	return toJsonlEntries(document)
		.map((entry) => `${JSON.stringify(entry)}\n`)
		.join('');
}

/**
 * Internal whitespace collapsed, so a unit spanning a line break stays on one
 * line.
 *
 * JSON escapes a newline as `\n` inside a string, so the file would not
 * actually break — but a "line-delimited" record containing what looks like a
 * line break is a trap for anyone reading it with their eyes, and the CSV
 * collapses whitespace for the same reason. The two exports describe the same
 * units and should not disagree about what a unit's text is.
 */
function collapse(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

/**
 * The file as bytes.
 *
 * No byte-order mark, unlike the CSV. The BOM is there for Excel, and nothing
 * that reads JSON Lines wants one — `JSON.parse` rejects a leading U+FEFF, so
 * adding it would break the first record of every file.
 */
export function toJsonlBlob(document: ParsedDocument): Blob {
	return new Blob([toJsonl(document)], { type: 'application/x-ndjson;charset=utf-8;' });
}

/** `langchunk-en-2026-08-05.jsonl` */
export function jsonlFilename(document: ParsedDocument, now = new Date()): string {
	return `langchunk-${document.language.code}-${now.toISOString().slice(0, 10)}.jsonl`;
}
