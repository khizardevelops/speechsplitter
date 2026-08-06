/**
 * JSON Lines export.
 *
 * The shape is the whole contract here — four entries, one per level — because
 * a consumer reading four records must never be handed three. Everything else
 * JSON already guarantees, which is the reason to offer this alongside the CSV:
 * a comma inside a sentence needs quoting rules there and needs nothing here.
 */

import { describe, expect, it } from 'vitest';
import { jsonlFilename, toJsonl, toJsonlBlob, toJsonlEntries } from './jsonl';
import type { ParsedDocument } from './types';

const confidence = { score: 1, tier: 'high' as const };

/**
 * A small but complete document, built here rather than by calling the engine.
 *
 * The export is what is under test; involving an analyzer would make these
 * tests need a running server and a downloaded model to check a line count.
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
			{ id: 's1', span: { start: 0, end: text.length }, text, clauseIds: ['c1', 'c2'], confidence }
		],
		clauses: [
			{
				id: 'c1',
				type: 'independent',
				span: { start: 0, end: 15 },
				text: 'The dog barked',
				predicateWordId: 'w3',
				phraseIds: ['p1'],
				confidence
			},
			{
				id: 'c2',
				type: 'coordinated',
				span: { start: 16, end: 32 },
				text: 'and the cat slept',
				predicateWordId: 'w7',
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

function minimal(): ParsedDocument {
	return {
		schemaVersion: '4.1',
		originalText: 'The dog barked.',
		language: { code: 'en', tier: 'dedicated-high', resolution: 'declared' },
		sentences: [],
		clauses: [],
		phrases: [],
		words: [],
		analyzer: { id: 'test', version: '1' }
	};
}

/** Read the file back the way a consumer would. */
function records(document: ParsedDocument): Array<{
	level: string;
	count: number;
	values: string[];
}> {
	return toJsonl(document)
		.split('\n')
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line));
}

describe('toJsonl', () => {
	it('is exactly four entries, one per level', () => {
		expect(records(sample()).map((entry) => entry.level)).toEqual([
			'sentences',
			'clauses',
			'phrases',
			'words'
		]);
	});

	it('lists each level in document order', () => {
		const entries = records(sample());
		expect(entries[0]!.values).toEqual(['The dog barked and the cat slept.']);
		expect(entries[1]!.values).toEqual(['The dog barked', 'and the cat slept']);
		expect(entries[2]!.values).toEqual(['The dog']);
		expect(entries[3]!.values).toEqual(['The', 'dog', 'barked', 'and', 'the', 'cat', 'slept']);
	});

	it('states a count that matches what it shipped', () => {
		for (const entry of records(sample())) {
			expect(entry.count).toBe(entry.values.length);
		}
	});

	it('never repeats a sentence', () => {
		// The failure that made the denormalised shape unusable: one row per word
		// restating the whole sentence on each, so most of the file said the same
		// thing over and over. Four entries cannot do that.
		const document = sample();
		expect(records(document)[0]!.values).toHaveLength(document.sentences.length);
	});

	it('still emits four entries when there is nothing to export', () => {
		// A consumer reading four records should never have to handle three.
		const entries = records(minimal());
		expect(entries).toHaveLength(4);
		expect(entries.every((entry) => entry.count === 0)).toBe(true);
	});

	it('terminates the last line, so wc -l counts four', () => {
		const text = toJsonl(sample());
		expect(text.endsWith('\n')).toBe(true);
		expect(text.split('\n').length - 1).toBe(4);
	});

	it('needs no escaping for a comma or a quotation mark', () => {
		const document = sample();
		document.sentences[0]!.text = 'He said "go, now".';
		expect(records(document)[0]!.values[0]).toBe('He said "go, now".');
	});

	it('keeps a unit spanning a line break on one line', () => {
		const document = sample();
		document.sentences[0]!.text = 'One line\nand another';
		expect(records(document)[0]!.values[0]).toBe('One line and another');
		expect(records(document)).toHaveLength(4);
	});

	it('survives Cyrillic', () => {
		const document = minimal();
		document.words = [
			{
				id: 'w1',
				text: 'Погода',
				span: { start: 0, end: 6 },
				upos: 'NOUN',
				isMultiword: false,
				confidence
			}
		];
		expect(records(document)[3]!.values).toEqual(['Погода']);
	});

	it('carries no ids, offsets, tags, or confidence', () => {
		// Same restraint as the CSV. The JSON export is the one that keeps
		// everything; this is the four lists and nothing else.
		const text = toJsonl(sample());
		for (const leak of ['w1', 'c1', 'p1', 'span', 'start', 'confidence', 'upos']) {
			expect(text).not.toContain(leak);
		}
	});
});

describe('toJsonlEntries', () => {
	it('is the same four entries, unserialised', () => {
		expect(toJsonlEntries(sample()).map((entry) => entry.level)).toEqual([
			'sentences',
			'clauses',
			'phrases',
			'words'
		]);
	});
});

describe('toJsonlBlob', () => {
	it('has no byte-order mark', async () => {
		// The CSV needs one for Excel. Nothing that reads JSON Lines does, and
		// `JSON.parse` rejects a leading U+FEFF — so a BOM here would break the
		// first record of every file.
		const bytes = new Uint8Array(await toJsonlBlob(sample()).arrayBuffer());
		expect([bytes[0], bytes[1], bytes[2]]).not.toEqual([0xef, 0xbb, 0xbf]);
		expect(bytes[0]).toBe('{'.charCodeAt(0));
	});

	it('is typed as newline-delimited JSON', () => {
		expect(toJsonlBlob(sample()).type).toContain('x-ndjson');
	});
});

describe('jsonlFilename', () => {
	it('names the file after the language and the date', () => {
		expect(jsonlFilename(minimal(), new Date('2026-08-05T12:00:00Z'))).toBe(
			'langchunk-en-2026-08-05.jsonl'
		);
	});
});
