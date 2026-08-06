/**
 * MIRROR of `packages/export/src/csv.ts`. Change that file first.
 *
 * The frontend installs with bun outside the pnpm workspace and must not import
 * from it (§8), so the CSV writer exists twice. Two copies are permitted; two
 * *behaviours* are not, and `packages/export/test/frontend-mirror.test.ts` runs
 * both over the same documents and fails the build if they ever disagree.
 *
 * ---
 *
 * The analysis as a spreadsheet: four columns, one per level.
 *
 * Column A lists every sentence, B every clause, C every phrase, D every word,
 * each in document order. You read *down* a column, not across a row. The
 * columns are independent lists and are as long as they need to be, so the
 * shorter ones simply stop.
 *
 * This replaced a denormalised version that put one row per word and repeated
 * the sentence, clause, and phrase each word belonged to. That shape is standard
 * for machine consumption and was unusable in practice: on a page of Dostoevsky
 * it produced 210 rows for 16 sentences, and **61% of the file was column A
 * repeating itself** — a 174-character sentence restated on all thirty of its
 * word rows. Whatever the theoretical merits of keeping rows self-contained, a
 * file nobody can read has none.
 *
 * The associations are not lost, they are simply not this file's job: the JSON
 * export carries the full hierarchy with offsets and confidence, and the Anki
 * export carries each unit with the sentence it came from.
 */

import type { ParsedDocument } from './types';

const COLUMNS = ['Sentences', 'Clauses', 'Phrases', 'Words'] as const;

export function toCsv(document: ParsedDocument): string {
	const columns: string[][] = [
		document.sentences.map((unit) => unit.text),
		document.clauses.map((unit) => unit.text),
		document.phrases.map((unit) => unit.text),
		document.words.map((unit) => unit.text)
	];

	const rowCount = Math.max(...columns.map((column) => column.length), 0);
	const lines = [COLUMNS.join(',')];

	for (let row = 0; row < rowCount; row++) {
		lines.push(columns.map((column) => escapeCell(column[row] ?? '')).join(','));
	}

	return lines.join('\r\n');
}

/**
 * RFC 4180: quote when the value holds a delimiter, a quote, or a newline, and
 * double any embedded quotes.
 *
 * Not optional. Sentences routinely contain commas and quotation marks, and an
 * unescaped file still opens, still looks like a table, and has every column
 * after the offending cell shifted by one.
 *
 * Internal whitespace is collapsed so a unit spanning a line break stays on one
 * row.
 */
function escapeCell(value: string): string {
	const text = value.replace(/\s+/g, ' ').trim();
	if (!/[",\r\n]/.test(text)) return text;
	return `"${text.replace(/"/g, '""')}"`;
}

/**
 * The CSV as bytes, prefixed with a UTF-8 byte-order mark.
 *
 * The BOM is for Excel, which otherwise reads a UTF-8 file in the local codepage
 * and turns every Cyrillic character into mojibake — an export that only
 * survives in English would be a quiet failure of the feature.
 */
export function toCsvBlob(document: ParsedDocument): Blob {
	return new Blob(['﻿', toCsv(document)], { type: 'text/csv;charset=utf-8;' });
}

/** `langchunk-en-2026-08-05.csv` */
export function csvFilename(document: ParsedDocument, now = new Date()): string {
	const date = now.toISOString().slice(0, 10);
	return `langchunk-${document.language.code}-${date}.csv`;
}
