#!/usr/bin/env node
/**
 * The local LangChunk service.
 *
 * A small HTTP server the web app talks to. It owns three things the browser
 * cannot: the pack registry, installing packs onto disk, and running the models.
 *
 * Plain `node:http` rather than a framework. There are five routes, one of them
 * streams, and the dependency-free version is shorter than the configuration a
 * framework would need — this is also the process a user is asked to download,
 * so its install size is not free.
 *
 * Requests never span more than one language, so engines are cached per pack and
 * held open (`analyzers.ts`).
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { buildDocument } from 'langchunk/grammar';
import { isBroadFallback, listPacks, packOrFallbackFor } from 'langchunk/lang';
import { installLanguagePlugins } from 'langchunk/lang-node';
import {
	buildCorrection,
	summarise,
	toFixtureSkeleton,
	type CorrectionKind,
	type CorrectionUnit,
} from '@langchunk/corrections';
import { segmentSentences } from 'langchunk/segment';
import { formatBytes, packsFor, type LanguagePackManifest } from '@langchunk/packs';
import { analyzerFor, availableRuntimes, selectPack, shutdown } from './analyzers.js';
import { installPack, isInstalled, removePack } from './installer.js';
import { loadRegistry, registryBase, registryUrl } from './registry.js';
import { appendCorrection, correctionsFile, readCorrections } from './corrections.js';

const PORT = Number(process.env['LANGCHUNK_PORT'] ?? 8787);
const ORIGIN = process.env['LANGCHUNK_ORIGIN'] ?? '*';

function json(response: ServerResponse, status: number, body: unknown): void {
	const text = JSON.stringify(body);
	response.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'content-length': Buffer.byteLength(text),
		'access-control-allow-origin': ORIGIN,
	});
	response.end(text);
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(chunk as Buffer);
	return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

/** Every pack for a language, annotated with whether it is on disk. */
async function describeLanguage(code: string, candidates: LanguagePackManifest[]) {
	const installs = await Promise.all(candidates.map((pack) => isInstalled(pack)));
	const installedPacks = candidates.filter((_, index) => installs[index]);
	const runtimes = availableRuntimes();

	// What the user would get *now*: the best pack that is both installed and
	// runnable here. What they *could* get is the best runnable pack overall.
	const active = selectPack(installedPacks);
	const best = selectPack(candidates);
	const first = candidates[0]!;

	return {
		code,
		name: first.name,
		nativeName: first.nativeName,
		installed: active !== undefined,
		// Offered but unusable is worth distinguishing from unavailable: it tells
		// the user their machine, not the catalogue, is the limit.
		runnable: best !== undefined,
		activeRuntime: active?.runtime ?? null,
		accuracy: (active ?? best)?.accuracy ?? null,
		// What still has to be fetched: nothing if a usable pack is already in
		// place, and nothing for a pack that has no files to begin with.
		downloadBytes: active ? 0 : (best?.totalBytes ?? 0),
		downloadLabel:
			active || !best || best.totalBytes === 0 ? null : formatBytes(best.totalBytes),
		requires: best?.requires ?? null,
		variants: candidates.map((pack, index) => ({
			runtime: pack.runtime,
			version: pack.version,
			installed: installs[index],
			runnableHere: runtimes.has(pack.runtime),
			clauseF1: pack.accuracy.clauseF1,
			bytes: pack.totalBytes,
		})),
	};
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
	const url = new URL(request.url ?? '/', `http://localhost:${PORT}`);

	if (request.method === 'OPTIONS') {
		response.writeHead(204, {
			'access-control-allow-origin': ORIGIN,
			'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
			'access-control-allow-headers': 'content-type',
		});
		response.end();
		return;
	}

	if (url.pathname === '/api/health') {
		json(response, 200, {
			ok: true,
			runtimes: [...availableRuntimes()],
			registry: registryUrl(),
		});
		return;
	}

	if (url.pathname === '/api/languages' && request.method === 'GET') {
		const registry = await loadRegistry();
		const codes = [...new Set(registry.packs.map((pack) => pack.code))];
		const languages = await Promise.all(
			codes.map((code) => describeLanguage(code, packsFor(registry, code))),
		);

		// Languages that exist as *language* packs — built-in or plugin — but have
		// no entry in the model-pack catalogue. Pashto is the live case: its data
		// layer is installed and hand-editable, and no Tier 1 model exists anywhere
		// (§17.2). Hiding it would contradict the pack the user just added; listing
		// it as installable would promise a download that does not exist. So it
		// appears, honestly unusable, with the reason in the line the UI already
		// renders for machines that lack a runtime.
		const modelled = new Set(codes);
		for (const pack of listPacks()
			.filter((candidate) => !modelled.has(candidate.code) && !isBroadFallback(candidate))
			.sort((a, b) => a.code.localeCompare(b.code))) {
			languages.push({
				code: pack.code,
				name: pack.name,
				nativeName: pack.nativeName,
				installed: false,
				runnable: false,
				activeRuntime: null,
				accuracy: null,
				downloadBytes: 0,
				downloadLabel: null,
				requires: 'a Tier 1 model — none exists for this language yet',
				variants: [],
			});
		}

		json(response, 200, { languages, registry: registryUrl() });
		return;
	}

	const installMatch = url.pathname.match(/^\/api\/languages\/([a-z-]+)\/install$/);
	if (installMatch && request.method === 'POST') {
		const code = installMatch[1]!;
		const registry = await loadRegistry();
		const pack = selectPack(packsFor(registry, code));

		if (!pack) {
			json(response, 404, { error: `No pack for ${code} that this machine can run.` });
			return;
		}

		// Server-sent events: a 233 MB download needs a progress bar, and SSE is
		// the smallest thing that gives one over plain HTTP.
		response.writeHead(200, {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache',
			connection: 'keep-alive',
			'access-control-allow-origin': ORIGIN,
		});

		let lastSent = 0;
		try {
			await installPack(pack, registryBase(), (progress) => {
				// Throttled: the download emits chunk events far faster than any
				// interface can paint, and flooding the socket slows the transfer.
				const now = Date.now();
				if (progress.phase === 'downloading' && now - lastSent < 100) return;
				lastSent = now;
				response.write(`data: ${JSON.stringify(progress)}\n\n`);
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			response.write(`data: ${JSON.stringify({ phase: 'error', message })}\n\n`);
		}
		response.end();
		return;
	}

	const removeMatch = url.pathname.match(/^\/api\/languages\/([a-z-]+)$/);
	if (removeMatch && request.method === 'DELETE') {
		const registry = await loadRegistry();
		for (const pack of packsFor(registry, removeMatch[1]!)) await removePack(pack);
		json(response, 200, { ok: true });
		return;
	}

	if (url.pathname === '/api/analyze' && request.method === 'POST') {
		const body = await readJson<{ text?: string; language?: string }>(request);
		const text = body.text ?? '';
		const code = body.language ?? '';

		if (text.trim().length === 0) {
			json(response, 400, { error: 'No text to analyze.' });
			return;
		}

		const registry = await loadRegistry();
		const candidates = packsFor(registry, code);
		const installs = await Promise.all(candidates.map((pack) => isInstalled(pack)));
		const pack = selectPack(candidates.filter((_, index) => installs[index]));

		if (!pack) {
			json(response, 409, {
				error: `The ${code} language pack is not installed yet.`,
				needsInstall: true,
			});
			return;
		}

		// A downloadable model pack and a language *configuration* are separate
		// things, and only the first is required to analyse anything. A language
		// with a model but no hand-tuned pack parses at broad-fallback tier with
		// capped confidence rather than being refused — §14 Stage 6.
		const languagePack = packOrFallbackFor(code);

		try {
			const analyzer = await analyzerFor(pack);
			const spans = segmentSentences(text, languagePack.segmentation);
			const analyzed = await (
				analyzer as unknown as {
					analyzeSegmented?: (t: string, s: unknown, l: string) => Promise<never>;
				}
			).analyzeSegmented?.(text, spans, code) ?? (await analyzer.analyze(text, code));

			const document = buildDocument({
				text,
				sentences: analyzed,
				language: {
					code: languagePack.code,
					tier: languagePack.tier,
					resolution: 'declared',
				},
				analyzer: { id: analyzer.id, version: analyzer.version },
				options: languagePack.grammar,
				...(isBroadFallback(languagePack)
					? {
							warnings: [
								`no language pack for ${languagePack.code}; parsed with Tier 2's ` +
									'language-neutral defaults at broad-fallback tier, and confidence ' +
									'is capped because nothing about this language has been measured',
							],
						}
					: {}),
			});

			json(response, 200, { document, runtime: pack.runtime, accuracy: pack.accuracy });
		} catch (error) {
			json(response, 500, {
				error: error instanceof Error ? error.message : String(error),
			});
		}
		return;
	}

	// --- the correction loop, §11.6 ---------------------------------------
	//
	// Deliberately the last thing in the pipeline and the least powerful. A
	// report is stored and triaged; nothing here can promote one into a fixture
	// or into a gate. §11.6 is explicit that it must not precede §11.1, and the
	// reason is §11.3: the v2 suite reported 100% F1 on a measurably wrong
	// parser because its answer key came from the thing being graded.
	if (url.pathname === '/api/corrections' && request.method === 'POST') {
		const body = await readJson<{
			document?: unknown;
			unit?: CorrectionUnit;
			unitId?: string;
			kind?: CorrectionKind;
			expected?: string;
			note?: string;
		}>(request);

		if (!body.document || !body.unit || !body.unitId || !body.kind) {
			json(response, 400, {
				error: 'A correction needs the document, a unit, its id, and a kind.',
			});
			return;
		}

		try {
			const correction = buildCorrection({
				document: body.document as never,
				unit: body.unit,
				unitId: body.unitId,
				kind: body.kind,
				// The clock and the id belong to the host, so the package stays
				// pure and its output stays reproducible in a test.
				at: new Date().toISOString(),
				id: randomUUID(),
				...(body.expected !== undefined ? { expected: body.expected } : {}),
				...(body.note !== undefined ? { note: body.note } : {}),
			});

			await appendCorrection(correction);
			json(response, 201, { correction, storedAt: correctionsFile() });
		} catch (error) {
			json(response, 400, { error: error instanceof Error ? error.message : String(error) });
		}
		return;
	}

	if (url.pathname === '/api/corrections' && request.method === 'GET') {
		const corrections = await readCorrections();
		json(response, 200, {
			file: correctionsFile(),
			summary: summarise(corrections),
			// The skeletons are the point: what a reader can hand to whoever
			// finishes the fixture by reading the sentence themselves.
			corrections: corrections.map((correction) => ({
				...correction,
				fixture: toFixtureSkeleton(correction),
			})),
		});
		return;
	}

	json(response, 404, { error: 'Not found' });
}

const server = createServer((request, response) => {
	handle(request, response).catch((error: unknown) => {
		json(response, 500, { error: error instanceof Error ? error.message : String(error) });
	});
});

// Language plugins are installed before the socket opens, so the first request
// sees the same registry every later one will.
await installLanguagePlugins();

server.listen(PORT, () => {
	process.stdout.write(
		`langchunk server on http://localhost:${PORT}\n` +
			`  runtimes: ${[...availableRuntimes()].join(', ')}\n` +
			`  registry: ${registryUrl()}\n`,
	);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		shutdown();
		server.close(() => process.exit(0));
	});
}
