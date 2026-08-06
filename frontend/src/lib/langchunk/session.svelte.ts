/**
 * Everything the app knows, in one place both shells read.
 *
 * The desktop and mobile interfaces are genuinely different layouts — a
 * sidebar-and-toolbar window against a single scrolling column — but they are
 * the same application underneath. Keeping the state and the actions here is
 * what stops that from becoming two applications that drift: there is one
 * definition of "can process", one install routine, one place a stale result is
 * thrown away.
 */

import { browser } from '$app/environment';
import {
	ServerUnavailableError,
	analyze,
	fetchLanguages,
	installLanguage,
	removeLanguage,
	type InstallProgress,
	type LanguageStatus
} from './client';
import { csvFilename, toCsv, toCsvBlob } from './csv';
import { jsonlFilename, toJsonl, toJsonlBlob } from './jsonl';
import type { ParsedDocument } from './types';

const LANGUAGE_KEY = 'langchunk.language';

export type ExportFormat = 'csv' | 'jsonl';

export class Session {
	languages = $state<LanguageStatus[]>([]);
	selected = $state('en');
	text = $state('');

	loadingLanguages = $state(true);
	processing = $state(false);
	serverDown = $state(false);
	error = $state<string | null>(null);

	result = $state<ParsedDocument | null>(null);
	runtime = $state<string | null>(null);

	installing = $state<string | null>(null);
	installProgress = $state<InstallProgress | null>(null);
	packError = $state<string | null>(null);

	/** Which export was last copied, so the button can say so briefly. */
	copied = $state<ExportFormat | null>(null);
	#copiedTimer: ReturnType<typeof setTimeout> | undefined;

	current = $derived(this.languages.find((language) => language.code === this.selected));
	ready = $derived(this.current?.installed === true);
	canProcess = $derived(this.ready && this.text.trim().length > 0 && !this.processing);
	installedCount = $derived(this.languages.filter((language) => language.installed).length);

	counts = $derived(
		this.result
			? ([
					['Sentences', this.result.sentences.length],
					['Clauses', this.result.clauses.length],
					['Phrases', this.result.phrases.length],
					['Words', this.result.words.length]
				] as const)
			: []
	);

	installFraction = $derived(
		this.installProgress && this.installProgress.total > 0
			? Math.min(1, this.installProgress.received / this.installProgress.total)
			: 0
	);

	constructor() {
		if (!browser) return;
		try {
			this.selected = localStorage.getItem(LANGUAGE_KEY) ?? 'en';
		} catch {
			/* storage unavailable; the default is fine */
		}
	}

	async refresh() {
		try {
			this.languages = await fetchLanguages();
			this.serverDown = false;
			if (
				!this.languages.some((language) => language.code === this.selected) &&
				this.languages[0]
			) {
				this.selected = this.languages[0].code;
			}
		} catch (cause) {
			if (cause instanceof ServerUnavailableError) this.serverDown = true;
			else this.error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			this.loadingLanguages = false;
		}
	}

	select(code: string) {
		if (code === this.selected) return;
		this.selected = code;
		this.invalidate();
		if (!browser) return;
		try {
			localStorage.setItem(LANGUAGE_KEY, code);
		} catch {
			/* storage unavailable; the choice still holds for this session */
		}
	}

	/**
	 * A result describes the exact text it came from — its spans index that
	 * string. Keeping it on screen after an edit would point at something that no
	 * longer exists.
	 */
	invalidate() {
		this.result = null;
		this.runtime = null;
	}

	async process() {
		if (!this.canProcess) return;
		this.processing = true;
		this.error = null;
		try {
			const outcome = await analyze(this.text, this.selected);
			this.result = outcome.document;
			this.runtime = outcome.runtime;
		} catch (cause) {
			this.error = cause instanceof Error ? cause.message : 'Analysis failed.';
			this.invalidate();
		} finally {
			this.processing = false;
		}
	}

	clearText() {
		this.text = '';
		this.invalidate();
	}

	async install(code: string) {
		this.installing = code;
		this.packError = null;
		this.installProgress = null;
		try {
			await installLanguage(code, (update) => (this.installProgress = update));
			await this.refresh();
		} catch (cause) {
			this.packError = cause instanceof Error ? cause.message : 'Install failed.';
		} finally {
			this.installing = null;
			this.installProgress = null;
		}
	}

	async remove(code: string) {
		this.packError = null;
		try {
			await removeLanguage(code);
			if (code === this.selected) this.invalidate();
			await this.refresh();
		} catch (cause) {
			this.packError = cause instanceof Error ? cause.message : 'Could not remove.';
		}
	}

	download(format: ExportFormat) {
		if (!this.result) return;
		const blob = format === 'csv' ? toCsvBlob(this.result) : toJsonlBlob(this.result);
		const name = format === 'csv' ? csvFilename(this.result) : jsonlFilename(this.result);
		// The object-URL dance has one step that is easy to leave out — revoking
		// the URL — so it lives here once rather than beside each format.
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = name;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	async copy(format: ExportFormat) {
		if (!this.result) return;
		const text = format === 'csv' ? toCsv(this.result) : toJsonl(this.result);
		try {
			await navigator.clipboard.writeText(text);
			this.copied = format;
			clearTimeout(this.#copiedTimer);
			this.#copiedTimer = setTimeout(() => (this.copied = null), 1600);
		} catch {
			this.error = 'The browser would not give the page access to the clipboard.';
		}
	}
}
