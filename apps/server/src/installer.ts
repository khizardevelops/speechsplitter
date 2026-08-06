/**
 * Installing a language pack.
 *
 * Downloads a manifest's files into `~/.langchunk/packs/<code>/<version>/`,
 * verifying each against its SHA-256 before it counts as installed.
 *
 * The verification is not ceremony. A pack is a model that will be loaded and
 * executed, fetched over a network the app does not control, and a truncated
 * download produces a file that loads and then behaves strangely rather than one
 * that fails cleanly. Checking the digest turns a silent wrong answer into a
 * loud error, which is the trade this project makes everywhere.
 *
 * Downloads go to a temporary directory and are moved into place only once every
 * file has been verified, so an interrupted install can never leave a
 * half-written pack that looks complete.
 */

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { InstallProgress, LanguagePackManifest } from '@langchunk/packs';

export const PACK_ROOT = process.env['LANGCHUNK_PACKS'] ?? join(homedir(), '.langchunk', 'packs');

export function packDirectory(manifest: LanguagePackManifest): string {
	return join(PACK_ROOT, manifest.code, `${manifest.runtime}-${manifest.version}`);
}

/**
 * Installed means every file is present at its recorded size.
 *
 * A pack with no files is installed by definition. Those are declarations that a
 * *local* runtime can serve the language — Stanza fetches its own models and
 * needs a Python environment the app cannot provide — so there is nothing to
 * download and nothing to verify. Whether that runtime exists on this machine is
 * a separate question, answered by `availableRuntimes`.
 */
export async function isInstalled(manifest: LanguagePackManifest): Promise<boolean> {
	if (manifest.files.length === 0) return true;

	const directory = packDirectory(manifest);
	for (const file of manifest.files) {
		try {
			const info = await stat(join(directory, file.path));
			if (info.size !== file.bytes) return false;
		} catch {
			return false;
		}
	}
	return true;
}

export async function removePack(manifest: LanguagePackManifest): Promise<void> {
	await rm(packDirectory(manifest), { recursive: true, force: true });
}

export async function installedCodes(): Promise<string[]> {
	try {
		return await readdir(PACK_ROOT);
	} catch {
		return [];
	}
}

/**
 * Download and verify a pack, reporting progress as it goes.
 *
 * `onProgress` is called often enough to drive a progress bar; these are
 * hundred-megabyte downloads and an interface that cannot show movement will be
 * assumed to have hung.
 */
async function openHttpStream(url: URL, signal?: AbortSignal): Promise<Readable> {
	const response = await fetch(url, signal ? { signal } : {});
	if (!response.ok || response.body === null) {
		throw new Error(`could not fetch ${url.pathname}: HTTP ${response.status}`);
	}
	return Readable.fromWeb(response.body as never);
}

export async function installPack(
	manifest: LanguagePackManifest,
	registryBase: string,
	onProgress: (progress: InstallProgress) => void,
	signal?: AbortSignal,
): Promise<void> {
	const finalDirectory = packDirectory(manifest);
	const stagingDirectory = `${finalDirectory}.partial`;

	await rm(stagingDirectory, { recursive: true, force: true });
	await mkdir(stagingDirectory, { recursive: true });

	const total = manifest.totalBytes;
	let receivedOverall = 0;

	try {
		for (const file of manifest.files) {
			const target = join(stagingDirectory, file.path);
			await mkdir(dirname(target), { recursive: true });

			const url = new URL(file.url, registryBase);
			const hash = createHash('sha256');
			let receivedForFile = 0;

			// Hash while streaming to disk rather than re-reading afterwards: these
			// files are large enough that a second pass is a noticeable stall.
			//
			// `file:` is handled separately because Node's fetch does not implement
			// that scheme. It is worth supporting: it makes the registry runnable
			// from a directory before anything is hosted, and the code path either
			// side of this line is identical, so publishing to a real URL changes
			// nothing but a configuration value.
			const source =
				url.protocol === 'file:'
					? createReadStream(fileURLToPath(url))
					: await openHttpStream(url, signal);
			source.on('data', (chunk: Buffer) => {
				hash.update(chunk);
				receivedForFile += chunk.length;
				receivedOverall += chunk.length;
				onProgress({
					phase: 'downloading',
					file: file.path,
					received: receivedOverall,
					total,
				});
			});

			await pipeline(source, createWriteStream(target));

			onProgress({ phase: 'verifying', file: file.path, received: receivedOverall, total });

			const digest = hash.digest('hex');
			if (digest !== file.sha256) {
				throw new Error(
					`${file.path} failed verification. Expected ${file.sha256.slice(0, 12)}…, ` +
						`got ${digest.slice(0, 12)}…. The download was corrupt or the file has changed.`,
				);
			}
			if (receivedForFile !== file.bytes) {
				throw new Error(
					`${file.path} is ${receivedForFile} bytes, expected ${file.bytes}.`,
				);
			}
		}

		// Only now does the pack exist. Anything that failed above leaves the
		// staging directory behind and the installed path untouched.
		await rm(finalDirectory, { recursive: true, force: true });
		await mkdir(dirname(finalDirectory), { recursive: true });
		await rename(stagingDirectory, finalDirectory);

		onProgress({ phase: 'done', received: total, total });
	} catch (error) {
		await rm(stagingDirectory, { recursive: true, force: true });
		const message = error instanceof Error ? error.message : String(error);
		onProgress({ phase: 'error', received: receivedOverall, total, message });
		throw error;
	}
}
