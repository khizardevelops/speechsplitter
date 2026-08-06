/**
 * Choosing and holding the analysis engines.
 *
 * The server never hardcodes which engine serves a language. It asks which
 * runtimes are *actually present* on this machine, then picks the installed pack
 * with the best measured clause F1 among them. Publishing a better pack changes
 * the answer; no code changes.
 *
 * Engines are held open once created. Loading a Stanza pipeline costs roughly
 * five seconds and an ONNX session under a second, and paying that per request
 * would make the interface feel broken.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Analyzer } from 'langchunk/schema';
import type { LanguagePackManifest, RuntimeId } from '@langchunk/packs';
import { chooseRuntime } from '@langchunk/packs';
import { packDirectory } from './installer.js';

const engines = new Map<string, Analyzer>();

/**
 * Which runtimes this machine can actually run.
 *
 * `onnx` is pure Node and always available. `stanza` needs a Python interpreter
 * with Stanza installed, which the app cannot install for the user — so it is
 * offered when present and simply absent otherwise. This is the honest form of
 * "highest accuracy available": use the better engine when it is there, and say
 * so, rather than pretending every install is equal.
 */
export function availableRuntimes(): Set<RuntimeId> {
	const runtimes = new Set<RuntimeId>(['onnx']);
	const python = process.env['LANGCHUNK_PYTHON'] ?? '.venv-stanza/bin/python';
	if (existsSync(python)) runtimes.add('stanza');
	return runtimes;
}

export function selectPack(
	candidates: readonly LanguagePackManifest[],
): LanguagePackManifest | undefined {
	return chooseRuntime(candidates, availableRuntimes());
}

export async function analyzerFor(manifest: LanguagePackManifest): Promise<Analyzer> {
	const key = `${manifest.code}:${manifest.runtime}:${manifest.version}`;
	const existing = engines.get(key);
	if (existing) return existing;

	const engine =
		manifest.runtime === 'stanza'
			? await loadStanza(manifest)
			: await loadOnnx(manifest);

	engines.set(key, engine);
	return engine;
}

async function loadOnnx(manifest: LanguagePackManifest): Promise<Analyzer> {
	const { OnnxAnalyzer } = await import('langchunk/analyzers/onnx');
	return OnnxAnalyzer.load({ modelDir: packDirectory(manifest) });
}

async function loadStanza(manifest: LanguagePackManifest): Promise<Analyzer> {
	const { StanzaAnalyzer } = await import('langchunk/analyzers/stanza');
	// Persistent, because this server answers many small requests and a fresh
	// pipeline per request costs seconds. See decisions.md §V4-38.
	return new StanzaAnalyzer({ persistent: true }) as unknown as Analyzer;
}

export function shutdown(): void {
	for (const engine of engines.values()) {
		(engine as { close?: () => void }).close?.();
	}
	engines.clear();
}

/** Where a pack's files ended up, for error messages. */
export function describePack(manifest: LanguagePackManifest): string {
	return join(packDirectory(manifest));
}
