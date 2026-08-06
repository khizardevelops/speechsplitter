<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { Block, BlockFooter, BlockTitle, Chip, List, ListItem } from 'konsta/svelte';
	import ConfidenceBadge from './ConfidenceBadge.svelte';
	import Disclosure from '$lib/components/Disclosure.svelte';
	import { buildOutline } from '$lib/langchunk/outline';
	import type { ClauseType, ParsedDocument } from '$lib/langchunk/types';

	let { document, detailed }: { document: ParsedDocument; detailed: boolean } = $props();

	const outline = $derived(buildOutline(document));

	const CLAUSE_COLOUR: Record<ClauseType | 'unknown', string> = {
		independent: 'bg-[var(--clause-independent)]',
		coordinated: 'bg-[var(--clause-coordinated)]',
		dependent: 'bg-[var(--clause-dependent)]',
		unknown: 'bg-[var(--clause-unknown)]'
	};

	// Konsta's Chip takes Tailwind classes, so the shared tokens are read through
	// arbitrary values — the same variables the desktop window uses. Written out
	// rather than assembled from the phrase type, because Tailwind generates
	// classes by reading this file and cannot see a name built at runtime.
	const PHRASE_COLOUR: Record<string, { fillBgIos: string; fillTextIos: string }> = {
		NP: { fillBgIos: 'bg-[var(--phrase-np-bg)]', fillTextIos: 'text-[var(--phrase-np-fg)]' },
		VP: { fillBgIos: 'bg-[var(--phrase-vp-bg)]', fillTextIos: 'text-[var(--phrase-vp-fg)]' },
		PP: { fillBgIos: 'bg-[var(--phrase-pp-bg)]', fillTextIos: 'text-[var(--phrase-pp-fg)]' },
		AdjP: { fillBgIos: 'bg-[var(--phrase-adjp-bg)]', fillTextIos: 'text-[var(--phrase-adjp-fg)]' },
		AdvP: { fillBgIos: 'bg-[var(--phrase-advp-bg)]', fillTextIos: 'text-[var(--phrase-advp-fg)]' }
	};

	const FALLBACK_PHRASE_COLOUR = {
		fillBgIos: 'bg-[var(--phrase-other-bg)]',
		fillTextIos: 'text-[var(--phrase-other-fg)]'
	};

	const open = new SvelteSet<string>();

	// A fresh analysis opens its first sentence and folds the rest. One sentence
	// is the common case and folding it would be ceremony; twenty unfolded is a
	// wall nobody scrolls through.
	$effect(() => {
		const first = outline.sentences[0];
		open.clear();
		if (first) open.add(first.sentence.id);
	});

	function plural(count: number, one: string, many: string): string {
		return `${count} ${count === 1 ? one : many}`;
	}
</script>

{#each outline.sentences as entry (entry.sentence.id)}
	<Disclosure
		title="Sentence {entry.number}"
		meta="{plural(entry.clauses.length, 'clause', 'clauses')} · {plural(
			entry.phraseCount,
			'phrase',
			'phrases'
		)}"
		open={open.has(entry.sentence.id)}
		onToggle={(next) => (next ? open.add(entry.sentence.id) : open.delete(entry.sentence.id))}
	>
		<List strong inset dividers>
			<!--
				The sentence heads its own group: one inset group per sentence is what
				keeps a long analysis readable, and the first row reads as the heading
				it is.
			-->
			<ListItem strongTitle title={entry.sentence.text} />

			{#each entry.clauses as node (node.clause.id)}
				<ListItem mediaClass="self-stretch py-3">
					<!--
						Depth is drawn, not indented with a padding class: the value is
						computed at runtime and Tailwind only generates classes it can see
						in the source. The rule doubles as the clause-type colour.
					-->
					{#snippet media()}
						<div class="flex" style="padding-inline-start: {node.depth * 14}px">
							<div
								class="w-[3px] rounded-full {CLAUSE_COLOUR[node.clause.type] ??
									CLAUSE_COLOUR.unknown}"
							></div>
						</div>
					{/snippet}

					{#snippet header()}
						<div class="flex items-center gap-1.5">
							<span class="font-semibold tracking-wide uppercase">{node.label}</span>
							{#if detailed}
								<ConfidenceBadge confidence={node.clause.confidence} />
								<span class="font-mono opacity-45">
									{node.clause.span.start}–{node.clause.span.end}
								</span>
							{/if}
						</div>
					{/snippet}

					{#snippet title()}
						<span class="leading-snug">{node.clause.text}</span>
					{/snippet}

					<!--
						The subject and the predicate are named outright when asked for.
						Both are present in the data for every clause, and both are the first
						thing anyone asks of one — but a one-word subject or verb is not a
						phrase, so neither reliably appears among the chips below.
					-->
					{#snippet footer()}
						{#if detailed}
							<div class="flex flex-wrap gap-x-4 gap-y-0.5">
								{#if node.subject}
									<span>subject <b class="font-semibold">{node.subject}</b></span>
								{/if}
								{#if node.predicate}
									<span>predicate <b class="font-semibold">{node.predicate}</b></span>
								{/if}
								{#if node.connector}
									<span>connector <b class="font-semibold">{node.connector}</b></span>
								{/if}
							</div>
						{/if}
					{/snippet}

					{#snippet inner()}
						{#if node.phrases.length > 0}
							<div class="mt-2 flex flex-wrap gap-1.5">
								{#each node.phrases as phrase (phrase.id)}
									<Chip colors={PHRASE_COLOUR[phrase.type] ?? FALLBACK_PHRASE_COLOUR}>
										{#snippet media()}
											<!--
												Konsta pulls a chip's media into its left padding, so a
												full-height tinted cap reads as one piece with the chip
												rather than as a label floating inside it.
											-->
											<span
												class="flex h-7 items-center rounded-s-full bg-black/8 px-2.5 text-[10px] font-bold tracking-wide dark:bg-white/10"
											>
												{phrase.type}
											</span>
										{/snippet}
										{phrase.text}
									</Chip>
								{/each}
							</div>
						{/if}
					{/snippet}
				</ListItem>
			{/each}
		</List>
	</Disclosure>
{/each}

{#if outline.multiwords.length > 0}
	<BlockTitle>
		<span>Multi-word units</span>
		<span class="text-[13px] font-normal opacity-50">{outline.multiwords.length}</span>
	</BlockTitle>

	<Block strong inset class="flex flex-wrap gap-1.5">
		{#each outline.multiwords as word (word.id)}
			<Chip>{word.text}</Chip>
		{/each}
	</Block>

	<BlockFooter inset>Several tokens that behave as one word.</BlockFooter>
{/if}
