/**
 * The shapes the UI reads — schema v4.1, mirrored.
 *
 * These are a deliberate copy of `@langchunk/schema`'s `ParsedDocument` rather
 * than an import. The frontend is installed with bun and its own `node_modules`,
 * outside the pnpm workspace that holds the analysis packages, so importing
 * across the boundary would mean linking the two package managers together
 * before a single screen exists.
 *
 * The copy is small, and it is the *contract* rather than the implementation, so
 * it changes rarely. When the real backend is wired up, replace this file with
 * `export type { ... } from '@langchunk/schema'` and everything above it keeps
 * compiling — that is the point of keeping it identical.
 *
 * Kept in sync by hand with `packages/schema/src/document.ts`.
 */

/** Character offsets into the ORIGINAL, unmodified input text. */
export interface Span {
	start: number;
	/** Exclusive. */
	end: number;
}

export type ConfidenceTier = 'high' | 'medium' | 'low';

export interface Confidence {
	/** 0–1. The minimum over the unit's tokens, not an average. */
	score: number;
	tier: ConfidenceTier;
	notes?: string[];
}

export type MultiwordType =
	| 'open-compound'
	| 'hyphenated-compound'
	| 'closed-compound'
	| 'idiomatic-unit';

export interface LangWord {
	id: string;
	text: string;
	span: Span;
	lemma?: string;
	upos: string;
	xpos?: string;
	morphology?: Record<string, string>;
	isMultiword: boolean;
	multiwordType?: MultiwordType;
	componentSpans?: Span[];
	confidence: Confidence;
}

/** No "unknown" member: every phrase has a typed head by construction. */
export type PhraseType = 'NP' | 'VP' | 'PP' | 'AdjP' | 'AdvP';

export interface LangPhrase {
	id: string;
	type: PhraseType;
	span: Span;
	text: string;
	headWordId: string;
	/** Always two or more — a single word is not a phrase. */
	wordIds: string[];
	confidence: Confidence;
}

export type ClauseType = 'independent' | 'coordinated' | 'dependent';

export type DependentClauseRole = 'adverbial' | 'relative' | 'complement' | 'subject';

export interface LangClause {
	id: string;
	type: ClauseType;
	/** Present if and only if type === 'dependent'. */
	dependentRole?: DependentClauseRole;
	span: Span;
	text: string;
	/** Set when the subject is a phrase of two or more words. */
	subjectPhraseId?: string;
	/** The head word of the subject. Set whenever there is an overt subject. */
	subjectWordId?: string;
	predicateWordId: string;
	/** The retained connector — "and", "that", "because". */
	connector?: { text: string; span: Span };
	parentClauseId?: string;
	phraseIds: string[];
	confidence: Confidence;
}

export interface LangSentence {
	id: string;
	span: Span;
	text: string;
	clauseIds: string[];
	confidence: Confidence;
}

export type LanguageTier = 'dedicated-high' | 'dedicated-developing' | 'broad-fallback';

export interface ParsedDocument {
	schemaVersion: '4.1';
	originalText: string;
	language: {
		/** BCP-47. */
		code: string;
		tier: LanguageTier;
		resolution: 'declared' | 'detected';
	};
	sentences: LangSentence[];
	clauses: LangClause[];
	phrases: LangPhrase[];
	words: LangWord[];
	analyzer: { id: string; version: string };
	warnings?: string[];
}

/** What the UI calls to analyze text. The seam the real backend plugs into. */
export interface Analyzer {
	readonly id: string;
	analyze(text: string, language: string): Promise<ParsedDocument>;
}
