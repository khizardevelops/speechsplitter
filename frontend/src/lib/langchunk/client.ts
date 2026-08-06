/**
 * Talking to the local LangChunk service.
 *
 * The app is a web page; the analysis is not. Models are hundreds of megabytes
 * and the most accurate engine needs a Python environment, so both live in a
 * local server the browser calls. This file is the only place that knows the
 * server exists.
 *
 * **Languages are installed on demand, one at a time.** Nothing about English or
 * Russian ships in this bundle: choosing a language shows what it would cost to
 * download, installing it fetches and verifies a pack, and only then can it be
 * analysed. That is what keeps first load small and lets languages be added
 * without shipping a new build.
 */

import type { ParsedDocument } from './types';

const DEFAULT_BASE = 'http://localhost:8787';

export function serverUrl(): string {
	return import.meta.env.VITE_LANGCHUNK_SERVER ?? DEFAULT_BASE;
}

export interface PackAccuracy {
	clauseF1: number;
	phraseF1: number;
	wordF1: number;
	sentences: number;
	treebank: string;
}

export interface PackVariant {
	runtime: 'onnx' | 'stanza';
	version: string;
	installed: boolean;
	runnableHere: boolean;
	clauseF1: number;
	bytes: number;
}

export interface LanguageStatus {
	code: string;
	name: string;
	nativeName: string;
	/** A usable pack is present. */
	installed: boolean;
	/** A pack exists that this machine could run, installed or not. */
	runnable: boolean;
	activeRuntime: 'onnx' | 'stanza' | null;
	accuracy: PackAccuracy | null;
	downloadBytes: number;
	/** `236 MB`, or null when there is nothing left to fetch. */
	downloadLabel: string | null;
	/** What the best runtime needs that this machine lacks. */
	requires: string | null;
	variants: PackVariant[];
}

export interface InstallProgress {
	phase: 'downloading' | 'verifying' | 'done' | 'error';
	file?: string;
	received: number;
	total: number;
	message?: string;
}

export class ServerUnavailableError extends Error {
	constructor() {
		super('The LangChunk service is not running.');
		this.name = 'ServerUnavailableError';
	}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	let response: Response;
	try {
		response = await fetch(`${serverUrl()}${path}`, init);
	} catch {
		// A refused connection is the ordinary state before the server is started,
		// not an exceptional one — the interface explains how to start it.
		throw new ServerUnavailableError();
	}

	const body = (await response.json()) as T & { error?: string };
	if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
	return body;
}

export async function fetchLanguages(): Promise<LanguageStatus[]> {
	const body = await request<{ languages: LanguageStatus[] }>('/api/languages');
	return body.languages;
}

/**
 * Install a language, reporting progress as it downloads.
 *
 * Server-sent events rather than polling: these are hundred-megabyte transfers
 * and a progress bar that only moves once a second reads as a hung one.
 */
export async function installLanguage(
	code: string,
	onProgress: (progress: InstallProgress) => void
): Promise<void> {
	let response: Response;
	try {
		response = await fetch(`${serverUrl()}/api/languages/${code}/install`, { method: 'POST' });
	} catch {
		throw new ServerUnavailableError();
	}
	if (!response.ok || !response.body) throw new Error(`Install failed: HTTP ${response.status}`);

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		// SSE frames are separated by a blank line; a chunk may hold several or
		// half of one.
		const frames = buffer.split('\n\n');
		buffer = frames.pop() ?? '';

		for (const frame of frames) {
			const line = frame.split('\n').find((part) => part.startsWith('data: '));
			if (!line) continue;
			const progress = JSON.parse(line.slice(6)) as InstallProgress;
			onProgress(progress);
			if (progress.phase === 'error') throw new Error(progress.message ?? 'Install failed.');
		}
	}
}

export async function removeLanguage(code: string): Promise<void> {
	await request(`/api/languages/${code}`, { method: 'DELETE' });
}

export interface AnalyzeResult {
	document: ParsedDocument;
	runtime: 'onnx' | 'stanza';
	accuracy: PackAccuracy;
}

export async function analyze(text: string, language: string): Promise<AnalyzeResult> {
	return request<AnalyzeResult>('/api/analyze', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ text, language })
	});
}
