/**
 * The flows the app exists for.
 *
 * The analysis lives in a local service, so these run against a stubbed one via
 * `page.route`. That is deliberate: a real service needs a downloaded model and
 * several seconds per sentence, which would make the suite slow, flaky, and
 * dependent on machine state — and none of that would test any more of *this*
 * code. What is under test here is the app's behaviour around the service:
 * install gating, stale results, error states, export.
 */

import { expect, test, type Page } from '@playwright/test';

const SERVER = 'http://localhost:8787';
const SENTENCE = 'The dog barked and the cat slept.';

function languagesBody(installed: boolean) {
	return {
		languages: [
			{
				code: 'en',
				name: 'English',
				nativeName: 'English',
				installed,
				runnable: true,
				activeRuntime: installed ? 'stanza' : null,
				accuracy: {
					clauseF1: 0.9227,
					phraseF1: 0.946,
					wordF1: 0.973,
					sentences: 300,
					treebank: 'en_ewt'
				},
				downloadBytes: installed ? 0 : 247702992,
				downloadLabel: installed ? null : '236 MB',
				requires: null,
				variants: []
			},
			{
				code: 'ru',
				name: 'Russian',
				nativeName: 'Русский',
				installed: false,
				runnable: true,
				activeRuntime: null,
				accuracy: null,
				downloadBytes: 106432857,
				downloadLabel: '101 MB',
				requires: null,
				variants: []
			}
		]
	};
}

const DOCUMENT = {
	schemaVersion: '4.1',
	originalText: SENTENCE,
	language: { code: 'en', tier: 'dedicated-high', resolution: 'declared' },
	sentences: [
		{
			id: 's1',
			span: { start: 0, end: SENTENCE.length },
			text: SENTENCE,
			clauseIds: ['c1'],
			confidence: { score: 1, tier: 'high' }
		}
	],
	clauses: [
		{
			id: 'c1',
			type: 'independent',
			span: { start: 0, end: 14 },
			text: 'The dog barked',
			predicateWordId: 'w3',
			subjectWordId: 'w2',
			phraseIds: ['p1'],
			confidence: { score: 1, tier: 'high' }
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
			confidence: { score: 1, tier: 'high' }
		}
	],
	words: [
		{
			id: 'w1',
			text: 'The',
			span: { start: 0, end: 3 },
			upos: 'DET',
			isMultiword: false,
			confidence: { score: 1, tier: 'high' }
		},
		{
			id: 'w2',
			text: 'dog',
			span: { start: 4, end: 7 },
			upos: 'NOUN',
			isMultiword: false,
			confidence: { score: 1, tier: 'high' }
		},
		{
			id: 'w3',
			text: 'barked',
			span: { start: 8, end: 14 },
			upos: 'VERB',
			isMultiword: false,
			confidence: { score: 1, tier: 'high' }
		}
	],
	analyzer: { id: 'stanza', version: 'test' }
};

async function stubServer(page: Page, options: { installed?: boolean } = {}) {
	const installed = options.installed ?? true;

	await page.route(`${SERVER}/api/languages`, (route) =>
		route.fulfill({ json: languagesBody(installed) })
	);
	await page.route(`${SERVER}/api/analyze`, (route) =>
		route.fulfill({
			json: {
				document: DOCUMENT,
				runtime: 'stanza',
				accuracy: {
					clauseF1: 0.9227,
					phraseF1: 0.946,
					wordF1: 0.973,
					sentences: 300,
					treebank: 'en_ewt'
				}
			}
		})
	);
}

test('explains itself when the service is not running', async ({ page }) => {
	// The ordinary first-run state, not an exception: the page cannot analyse
	// anything by itself and has to say where the work happens.
	await page.route(`${SERVER}/api/languages`, (route) => route.abort());
	await page.goto('/');
	await expect(page.getByText(/service is not running/i)).toBeVisible();
	await expect(page.getByText(/pnpm run server/)).toBeVisible();
});

test('will not analyse a language that is not installed', async ({ page }) => {
	await stubServer(page, { installed: false });
	await page.goto('/');

	await expect(page.getByText(/236 MB download/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Process' })).toBeDisabled();
	await expect(page.getByPlaceholder(/weather is nice/i)).toBeDisabled();
	await expect(page.getByText(/Install English to begin/i)).toBeVisible();
});

test('offers each language its own download', async ({ page }) => {
	// The point of the pack architecture: languages arrive one at a time, and the
	// cost of each is stated before it is incurred.
	await stubServer(page, { installed: false });
	await page.goto('/');
	// `exact`: a language row's accessible name ends "…236 MB download", so a
	// substring match would find the labels as well as the buttons.
	await expect(page.getByRole('button', { name: 'Download', exact: true })).toHaveCount(2);
	await expect(page.getByText('101 MB download')).toBeVisible();
});

test('shows measured accuracy for an installed language', async ({ page }) => {
	await stubServer(page);
	await page.goto('/');
	await expect(page.getByText(/92% clause accuracy/)).toBeVisible();
});

test('analyses text and shows every level', async ({ page }) => {
	await stubServer(page);
	await page.goto('/');

	await page.getByPlaceholder(/weather is nice/i).fill(SENTENCE);
	await page.getByRole('button', { name: 'Process' }).click();

	// `exact`: the navbar subtitle is "Sentences, clauses, phrases, words", and
	// getByText matches substrings case-insensitively by default.
	await expect(page.getByText('Analysis', { exact: true })).toBeVisible();
	await expect(page.getByText('Sentences', { exact: true })).toBeVisible();
	await expect(page.getByText('Clauses', { exact: true })).toBeVisible();
	await expect(page.getByText('Words', { exact: true })).toBeVisible();
	await expect(page.getByText(/stanza engine/)).toBeVisible();
});

test('clears a stale result when the text changes', async ({ page }) => {
	// The result carries character offsets into the text it came from. Leaving it
	// visible after an edit would point them at a string that no longer exists.
	await stubServer(page);
	await page.goto('/');
	const box = page.getByPlaceholder(/weather is nice/i);

	await box.fill(SENTENCE);
	await page.getByRole('button', { name: 'Process' }).click();
	await expect(page.getByText('Analysis', { exact: true })).toBeVisible();

	await box.fill(`${SENTENCE} And then it rained.`);
	await expect(page.getByText('Analysis', { exact: true })).toBeHidden();
});

test('downloads a CSV of the analysis', async ({ page }) => {
	await stubServer(page);
	await page.goto('/');
	await page.getByPlaceholder(/weather is nice/i).fill(SENTENCE);
	await page.getByRole('button', { name: 'Process' }).click();
	await expect(page.getByText('Analysis', { exact: true })).toBeVisible();

	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download CSV' }).click();
	const file = await download;

	expect(file.suggestedFilename()).toMatch(/^langchunk-en-\d{4}-\d{2}-\d{2}\.csv$/);

	const stream = await file.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(chunk as Buffer);
	const body = Buffer.concat(chunks).toString('utf8');

	expect(body).toContain('Sentences,Clauses,Phrases,Words');
	// Each level lists down its own column; the sentence appears once, not once
	// per word.
	const lines = body.trim().split('\r\n');
	expect(lines[1]).toBe('The dog barked and the cat slept.,The dog barked,The dog,The');
	expect(lines[2]?.startsWith(',')).toBe(true);
	expect(body).not.toContain('confidence');
});

test('downloads a JSONL of the analysis', async ({ page }) => {
	await stubServer(page);
	await page.goto('/');
	await page.getByPlaceholder(/weather is nice/i).fill(SENTENCE);
	await page.getByRole('button', { name: 'Process' }).click();
	await expect(page.getByText('Analysis', { exact: true })).toBeVisible();

	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download JSONL' }).click();
	const file = await download;

	expect(file.suggestedFilename()).toMatch(/^langchunk-en-\d{4}-\d{2}-\d{2}\.jsonl$/);

	const stream = await file.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(chunk as Buffer);
	const body = Buffer.concat(chunks).toString('utf8');

	// Four entries, one per level — not one per unit. The shape is the contract.
	const lines = body.split('\n').filter((line) => line.length > 0);
	expect(lines).toHaveLength(4);

	const entries = lines.map((line) => JSON.parse(line));
	expect(entries.map((entry) => entry.level)).toEqual(['sentences', 'clauses', 'phrases', 'words']);
	expect(entries[0].values).toEqual(['The dog barked and the cat slept.']);
	expect(entries[0].count).toBe(1);
	expect(body).not.toContain('confidence');
});

test('reports an analysis failure without losing the text', async ({ page }) => {
	await stubServer(page);
	await page.route(`${SERVER}/api/analyze`, (route) =>
		route.fulfill({ status: 500, json: { error: 'The model ran out of memory.' } })
	);
	await page.goto('/');

	await page.getByPlaceholder(/weather is nice/i).fill(SENTENCE);
	await page.getByRole('button', { name: 'Process' }).click();

	await expect(page.getByText('The model ran out of memory.')).toBeVisible();
	await expect(page.getByPlaceholder(/weather is nice/i)).toHaveValue(SENTENCE);
});
