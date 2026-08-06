/**
 * The shape both interfaces draw.
 *
 * A `ParsedDocument` is a set of flat lists joined by ids — the right thing to
 * transport and the wrong thing to render, because every view would have to
 * re-resolve the same references and rebuild the same nesting. Resolving it once
 * here is what lets the desktop and mobile shells stay presentation-only, and it
 * keeps the one piece of real logic — reconstructing the clause hierarchy — in a
 * single place with a single set of tests to answer for it.
 */

import type { LangClause, LangPhrase, LangSentence, LangWord, ParsedDocument } from './types';

export interface ClauseOutline {
	clause: LangClause;
	/** How deeply this clause is embedded in the one above it. */
	depth: number;
	/** `dependent · relative`, or just `independent` where there is no role. */
	label: string;
	subject: string | undefined;
	predicate: string | undefined;
	connector: string | undefined;
	phrases: LangPhrase[];
}

export interface SentenceOutline {
	sentence: LangSentence;
	number: number;
	clauses: ClauseOutline[];
	phraseCount: number;
}

export interface DocumentOutline {
	sentences: SentenceOutline[];
	multiwords: LangWord[];
}

export function buildOutline(document: ParsedDocument): DocumentOutline {
	const clausesById = new Map(document.clauses.map((clause) => [clause.id, clause]));
	const phrasesById = new Map(document.phrases.map((phrase) => [phrase.id, phrase]));
	const wordsById = new Map(document.words.map((word) => [word.id, word]));

	/**
	 * Clauses nest — a relative clause sits inside the clause it modifies — so
	 * the hierarchy is reconstructed rather than flattened. The nesting *is* the
	 * explanation; a flat list would show the same units and lose what relates
	 * them.
	 */
	function order(clauseIds: string[]): Array<{ clause: LangClause; depth: number }> {
		const own = clauseIds
			.map((id) => clausesById.get(id))
			.filter((clause): clause is LangClause => clause !== undefined);

		const children = new Map<string, LangClause[]>();
		const roots: LangClause[] = [];
		for (const clause of own) {
			const parent = clause.parentClauseId;
			if (parent !== undefined && clausesById.has(parent)) {
				children.set(parent, [...(children.get(parent) ?? []), clause]);
			} else {
				roots.push(clause);
			}
		}

		const out: Array<{ clause: LangClause; depth: number }> = [];
		const walk = (clause: LangClause, depth: number) => {
			out.push({ clause, depth });
			for (const child of children.get(clause.id) ?? []) walk(child, depth + 1);
		};
		for (const root of roots) walk(root, 0);
		return out;
	}

	// The subject and the predicate are resolved outright. Both are present in
	// the data for every clause, and both are the first thing anyone asks of one
	// — but a one-word subject or verb is not a phrase, so neither reliably
	// appears among the phrases.
	function subjectOf(clause: LangClause): string | undefined {
		if (clause.subjectPhraseId) return phrasesById.get(clause.subjectPhraseId)?.text;
		if (clause.subjectWordId) return wordsById.get(clause.subjectWordId)?.text;
		return undefined;
	}

	const sentences = document.sentences.map((sentence, index) => {
		const clauses = order(sentence.clauseIds).map(({ clause, depth }): ClauseOutline => {
			const phrases = clause.phraseIds
				.map((id) => phrasesById.get(id))
				.filter((phrase): phrase is LangPhrase => phrase !== undefined);

			return {
				clause,
				depth,
				label: clause.dependentRole ? `${clause.type} · ${clause.dependentRole}` : clause.type,
				subject: subjectOf(clause),
				predicate: wordsById.get(clause.predicateWordId)?.text,
				connector: clause.connector?.text,
				phrases
			};
		});

		return {
			sentence,
			number: index + 1,
			clauses,
			phraseCount: clauses.reduce((total, node) => total + node.phrases.length, 0)
		};
	});

	return {
		sentences,
		multiwords: document.words.filter((word) => word.isMultiword)
	};
}
