/**
 * CSV export.
 *
 * Worth testing rather than eyeballing: a broken quote shifts every column after
 * it, and the file still opens, still looks like a table, and is wrong. The
 * failure is invisible in exactly the place people stop looking.
 */

import { describe, expect, it } from 'vitest';
import { csvFilename, toCsv, toCsvBlob } from './csv';
import type { ParsedDocument } from './types';

const confidence = { score: 1, tier: 'high' as const };

/**
 * A small but complete document, built here rather than by calling the engine.
 *
 * The export is what is under test; involving an analyzer would make these tests
 * need a running server and a downloaded model to check comma escaping.
 */
function sample(): ParsedDocument {
	const text = 'The dog barked and the cat slept.';
	const word = (id: string, value: string, start: number) => ({
		id,
		text: value,
		span: { start, end: start + value.length },
		upos: 'X',
		isMultiword: false,
		confidence
	});

	return {
		schemaVersion: '4.1',
		originalText: text,
		language: { code: 'en', tier: 'dedicated-high', resolution: 'declared' },
		sentences: [
			{
				id: 's1',
				span: { start: 0, end: text.length },
				text,
				clauseIds: ['c1', 'c2'],
				confidence
			}
		],
		clauses: [
			{
				id: 'c1',
				type: 'independent',
				span: { start: 0, end: 15 },
				text: 'The dog barked',
				predicateWordId: 'w3',
				subjectWordId: 'w2',
				phraseIds: ['p1'],
				confidence
			},
			{
				id: 'c2',
				type: 'coordinated',
				span: { start: 16, end: 32 },
				text: 'and the cat slept',
				predicateWordId: 'w7',
				parentClauseId: 'c1',
				connector: { text: 'and', span: { start: 15, end: 18 } },
				phraseIds: [],
				confidence
			}
		],
		phrases: [
			{
				id: 'p1',
				type: 'NP',
				span: { start: 0, end: 7 },
				text: 'The dog',
				headWordId: 'w2',
				wordIds: ['w1', 'w2'],
				confidence
			}
		],
		words: [
			word('w1', 'The', 0),
			word('w2', 'dog', 4),
			word('w3', 'barked', 8),
			word('w4', 'and', 15),
			word('w5', 'the', 19),
			word('w6', 'cat', 23),
			word('w7', 'slept', 27)
		],
		analyzer: { id: 'test', version: '1' }
	};
}

function minimal(overrides: Partial<ParsedDocument> = {}): ParsedDocument {
	return {
		schemaVersion: '4.1',
		originalText: 'The dog barked.',
		language: { code: 'en', tier: 'dedicated-high', resolution: 'declared' },
		sentences: [],
		clauses: [],
		phrases: [],
		words: [],
		analyzer: { id: 'test', version: '1' },
		...overrides
	};
}

function rows(csv: string): string[] {
	return csv.split('\r\n');
}

/** Minimal RFC 4180 reader, so the tests check the file as a reader sees it. */
function parse(row: string): string[] {
	const fields: string[] = [];
	let field = '';
	let quoted = false;

	for (let i = 0; i < row.length; i++) {
		const character = row[i];
		if (quoted) {
			if (character === '"' && row[i + 1] === '"') {
				field += '"';
				i++;
			} else if (character === '"') {
				quoted = false;
			} else {
				field += character;
			}
		} else if (character === '"') {
			quoted = true;
		} else if (character === ',') {
			fields.push(field);
			field = '';
		} else {
			field += character;
		}
	}
	fields.push(field);
	return fields;
}

describe('toCsv', () => {
	it('has exactly the four columns, and nothing else', () => {
		expect(rows(toCsv(minimal()))[0]).toBe('Sentences,Clauses,Phrases,Words');
	});

	it('lists each level down its own column', () => {
		const body = rows(toCsv(sample())).slice(1);
		const column = (index: number) => body.map((row) => parse(row)[index]).filter(Boolean);

		expect(column(0)).toEqual(['The dog barked and the cat slept.']);
		expect(column(1)).toEqual(['The dog barked', 'and the cat slept']);
		expect(column(2)).toEqual(['The dog']);
		expect(column(3)).toEqual(['The', 'dog', 'barked', 'and', 'the', 'cat', 'slept']);
	});

	it('never repeats a sentence across rows', () => {
		// The failure that made the previous shape unusable: on real prose it put
		// one row per word and restated the whole sentence on each, so most of the
		// file was column A saying the same thing over and over.
		const document = sample();
		const sentences = rows(toCsv(document))
			.slice(1)
			.map((row) => parse(row)[0])
			.filter(Boolean);
		expect(new Set(sentences).size).toBe(sentences.length);
		expect(sentences.length).toBe(document.sentences.length);
	});

	it('is as long as its longest column, with the others left empty', () => {
		const document = sample();
		const body = rows(toCsv(document)).slice(1);
		expect(body).toHaveLength(document.words.length);
		// The last row has a word and nothing above it.
		expect(parse(body[body.length - 1]!)).toEqual(['', '', '', 'slept']);
	});

	it('carries no ids, offsets, tags, or confidence', () => {
		const csv = toCsv(sample());
		for (const leak of ['w1', 'c1', 'p1', 'NOUN', 'high', 'start', 'span']) {
			expect(csv).not.toContain(leak);
		}
	});

	it('quotes a sentence containing a comma, and does not shift the columns', () => {
		const document = sample();
		document.sentences[0]!.text = 'The dog barked, and the cat slept.';
		expect(parse(rows(toCsv(document))[1]!)[0]).toBe('The dog barked, and the cat slept.');
	});

	it('doubles embedded quotation marks', () => {
		const document = sample();
		document.words[0]!.text = 'he said "no"';
		expect(toCsv(document)).toContain('"he said ""no"""');
	});

	it('flattens newlines so a row stays a row', () => {
		const document = sample();
		document.sentences[0]!.text = 'One line\nand another';
		expect(toCsv(document)).toContain('One line and another');
	});

	it('produces only a header when there is nothing to export', () => {
		expect(rows(toCsv(minimal()))).toHaveLength(1);
	});
});

describe('toCsvBlob', () => {
	it('starts with a UTF-8 byte-order mark', async () => {
		// Without it Excel reads the file in the local codepage and every Cyrillic
		// character becomes mojibake — an export that only survives in English.
		//
		// Checked as bytes, not as text: `Blob.text()` runs the UTF-8 decode
		// algorithm, which strips a leading BOM, so the string form cannot see it.
		const document: ParsedDocument = {
			...sample(),
			originalText: 'Погода хорошая.',
			words: [
				{
					id: 'w1',
					text: 'Погода',
					span: { start: 0, end: 6 },
					upos: 'NOUN',
					isMultiword: false,
					confidence
				}
			],
			sentences: [],
			clauses: [],
			phrases: []
		};
		const bytes = new Uint8Array(await toCsvBlob(document).arrayBuffer());
		expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
		expect(await toCsvBlob(document).text()).toContain('Погода');
	});
});

describe('csvFilename', () => {
	it('names the file after the language and the date', () => {
		const document = minimal();
		expect(csvFilename(document, new Date('2026-08-02T12:00:00Z'))).toBe(
			'langchunk-en-2026-08-02.csv'
		);
	});
});
