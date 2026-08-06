<script lang="ts">
	import {
		Block,
		BlockFooter,
		BlockTitle,
		List,
		ListButton,
		Segmented,
		SegmentedButton
	} from 'konsta/svelte';
	import Analysis from './Analysis.svelte';
	import type { Session } from '$lib/langchunk/session.svelte';

	let { session }: { session: Session } = $props();

	// Compact still shows all four levels — that is the product, not a detail.
	// What it holds back is the annotation *about* each unit: which word is the
	// subject, how confident the model was, which characters it came from. Those
	// answer a second question, and asking it should be a deliberate act.
	let detailed = $state(false);
</script>

{#if session.result}
	<BlockTitle>
		<span>Analysis</span>
		<span class="text-[13px] font-normal opacity-50">{session.runtime} engine</span>
	</BlockTitle>

	<Block strong inset class="!py-3">
		<div class="grid grid-cols-4 gap-2 text-center">
			{#each session.counts as [label, value] (label)}
				<div>
					<div class="text-[20px] leading-tight font-semibold">{value}</div>
					<div class="text-[11px] opacity-60">{label}</div>
				</div>
			{/each}
		</div>
	</Block>

	<Block inset class="my-4">
		<!--
			Konsta's Segmented is full-width, which is right in a phone column and
			absurd across a desktop pane. The cap is wider than the phone column's
			inner width, so it only ever bites on the wide layout.
		-->
		<div class="max-w-sm">
			<Segmented strong rounded role="group" aria-label="Level of detail">
				<SegmentedButton
					aria-pressed={!detailed}
					active={!detailed}
					onClick={() => (detailed = false)}
				>
					Compact
				</SegmentedButton>
				<SegmentedButton
					aria-pressed={detailed}
					active={detailed}
					onClick={() => (detailed = true)}
				>
					Detailed
				</SegmentedButton>
			</Segmented>
		</div>
	</Block>

	<Analysis document={session.result} {detailed} />

	<BlockTitle>Export</BlockTitle>
	<List strong inset>
		<ListButton onClick={() => session.download('csv')}>Download CSV</ListButton>
		<ListButton onClick={() => session.download('jsonl')}>Download JSONL</ListButton>
		<ListButton onClick={() => session.copy('csv')}>
			{session.copied === 'csv' ? 'Copied' : 'Copy CSV'}
		</ListButton>
		<ListButton onClick={() => session.copy('jsonl')}>
			{session.copied === 'jsonl' ? 'Copied' : 'Copy JSONL'}
		</ListButton>
	</List>
	<BlockFooter inset>
		Both hold the same four lists — sentences, clauses, phrases, words. The CSV puts each in its own
		column to read down; the JSONL puts each on its own line to pipe.
	</BlockFooter>
{:else if session.ready && !session.serverDown}
	<!--
		Deliberately not headed "Analysis" — that word belongs to a result that
		exists, and reusing it here would leave a heading standing after a stale
		result is thrown away.
	-->
	<Block strong inset class="mt-8">
		<p class="font-semibold">Nothing analysed yet</p>
		<p class="mt-1 leading-relaxed opacity-60">
			Every sentence comes back split into clauses, phrases and words, each one traceable to the
			characters it came from.
		</p>
	</Block>
{/if}
