/**
 * @langchunk/packs — what a downloadable language is.
 *
 * A language is a *plugin*, not a build-time constant. Nothing about English
 * ships in the application: the model, its metadata, and the accuracy it was
 * measured at all live in a pack that is fetched when someone asks for that
 * language and verified before it is used. Adding a language means publishing a
 * pack and adding a line to a registry — no rebuild, no release.
 *
 * That shape is forced by the numbers. A single English model is ~233 MB and
 * Russian ~94 MB; bundling every language would make the first load enormous and
 * would grow without limit as languages are added.
 *
 * **A pack names its runtime, and carries the accuracy it was measured at.**
 * That is what lets the server choose between two ways of running the same
 * language on evidence rather than on a hardcoded preference — see
 * `chooseRuntime`.
 */

/** How a pack's model is executed. */
export type RuntimeId = 'onnx' | 'stanza';

/** One file in a pack, with what it takes to verify it. */
export interface PackFile {
	/** Path relative to the pack root, e.g. `model.onnx`. */
	readonly path: string;
	/** URL to fetch it from, absolute or relative to the registry. */
	readonly url: string;
	readonly bytes: number;
	/** Lowercase hex SHA-256. Checked after download; a mismatch aborts. */
	readonly sha256: string;
}

/**
 * Gate 2 F1, strict mode, as measured against gold trees.
 *
 * Carried in the pack rather than hardcoded because it is the basis on which a
 * runtime is chosen, and because it is the honest thing to show a user deciding
 * whether to trust a result.
 */
export interface PackAccuracy {
	readonly clauseF1: number;
	readonly phraseF1: number;
	readonly wordF1: number;
	/** How many sentences the figures were measured over. */
	readonly sentences: number;
	/** What it was measured against, e.g. `en_ewt`. */
	readonly treebank: string;
}

export interface LanguagePackManifest {
	/** BCP-47. */
	readonly code: string;
	readonly name: string;
	readonly nativeName: string;
	readonly runtime: RuntimeId;
	/** Bumped whenever the files change; part of the install path. */
	readonly version: string;
	readonly files: readonly PackFile[];
	readonly accuracy: PackAccuracy;
	/** Shown to the user before they commit to the download. */
	readonly totalBytes: number;
	/** Present when a runtime needs something the app cannot install itself. */
	readonly requires?: string;
}

export interface PackRegistry {
	readonly schemaVersion: '1';
	readonly packs: readonly LanguagePackManifest[];
}

/**
 * Pick the most accurate runtime available for a language.
 *
 * The whole point of recording accuracy in the manifest. Two packs may offer the
 * same language by different means — a pure-Node ONNX model that downloads
 * anywhere, and a Stanza pipeline that needs Python present but measures
 * considerably better. Choosing between them by clause F1 means the answer
 * improves automatically when a better pack is published, with no code change
 * and no stale preference list to forget about.
 *
 * Clause F1 is the criterion because clause structure is the hardest thing the
 * system does and the level a reader depends on most; word accuracy is close to
 * saturated across runtimes and so discriminates poorly.
 */
export function chooseRuntime(
	candidates: readonly LanguagePackManifest[],
	available: ReadonlySet<RuntimeId>,
): LanguagePackManifest | undefined {
	return candidates
		.filter((pack) => available.has(pack.runtime))
		.sort((a, b) => b.accuracy.clauseF1 - a.accuracy.clauseF1)[0];
}

/** Every pack offering a language, best first. */
export function packsFor(
	registry: PackRegistry,
	code: string,
): LanguagePackManifest[] {
	const wanted = code.toLowerCase().split('-')[0] ?? code;
	return registry.packs
		.filter((pack) => pack.code === wanted)
		.sort((a, b) => b.accuracy.clauseF1 - a.accuracy.clauseF1);
}

/** `233 MB`, for a download prompt. */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	const megabytes = bytes / (1024 * 1024);
	return megabytes < 100 ? `${megabytes.toFixed(1)} MB` : `${Math.round(megabytes)} MB`;
}

/** Progress of an install, as reported to the UI. */
export interface InstallProgress {
	readonly phase: 'downloading' | 'verifying' | 'done' | 'error';
	/** Which file, when downloading. */
	readonly file?: string;
	readonly received: number;
	readonly total: number;
	readonly message?: string;
}
