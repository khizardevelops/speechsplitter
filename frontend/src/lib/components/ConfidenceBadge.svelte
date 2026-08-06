<script lang="ts">
	import { Badge } from 'konsta/svelte';
	import type { Confidence } from '$lib/langchunk/types';

	let { confidence }: { confidence: Confidence } = $props();

	// Shown only when it is not high.
	//
	// The analysis reports a measured probability per unit, and a badge on every
	// single one would be noise that trains the eye to ignore it. Surfacing only
	// the doubtful ones is what makes the mark mean "look here".
	//
	// The colours come from the shared tokens, so a low-confidence clause is the
	// same red here as it is in the desktop window.
	const COLOURS: Record<string, string> = {
		medium: 'bg-[var(--caution)]',
		low: 'bg-[var(--danger)]'
	};
</script>

{#if confidence.tier !== 'high'}
	<Badge small class="px-1.5" colors={{ bg: COLOURS[confidence.tier] ?? 'bg-[#8e8e93]' }}>
		{confidence.tier}
		{Math.round(confidence.score * 100)}%
	</Badge>
{/if}
