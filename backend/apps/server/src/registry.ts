/**
 * Where pack manifests come from.
 *
 * A URL by default, so packs can be published and updated without shipping a new
 * application. It falls back to a directory inside the repository, which is what
 * makes the whole install flow runnable end to end before anything is hosted —
 * the code path is identical, only the base URL differs.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import type { PackRegistry } from '@langchunk/packs';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** Override with `LANGCHUNK_REGISTRY=https://…/registry.json`. */
export function registryUrl(): string {
	const declared = process.env['LANGCHUNK_REGISTRY'];
	if (declared) return declared;
	return pathToFileURL(join(REPO_ROOT, 'dist-packs', 'registry.json')).toString();
}

export function registryBase(): string {
	return new URL('.', registryUrl()).toString();
}

export async function loadRegistry(): Promise<PackRegistry> {
	const url = registryUrl();

	if (url.startsWith('file:')) {
		try {
			return JSON.parse(await readFile(fileURLToPath(url), 'utf8')) as PackRegistry;
		} catch {
			// No local registry built yet. An empty one is the honest answer: the
			// server runs, lists nothing, and says why.
			return { schemaVersion: '1', packs: [] };
		}
	}

	const response = await fetch(url);
	if (!response.ok) throw new Error(`registry ${url} returned HTTP ${response.status}`);
	return (await response.json()) as PackRegistry;
}
