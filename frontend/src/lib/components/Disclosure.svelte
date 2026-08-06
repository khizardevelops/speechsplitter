<script lang="ts">
	/**
	 * A collapsible section header.
	 *
	 * The one control in the app that Konsta does not ship, so it is built from
	 * the one it does: a `BlockTitle` — which is already the flex row Konsta uses
	 * for a section heading with a trailing note — holding a button that owns
	 * `aria-expanded` and points at the region it controls. Both shells use it, so
	 * a folded section looks and behaves the same in the window and on the phone.
	 */

	import type { Snippet } from 'svelte';
	import { BlockTitle } from 'konsta/svelte';
	import Glyph from './Glyph.svelte';

	let {
		title,
		meta,
		open = $bindable(true),
		onToggle,
		class: className = '',
		titleClass = '',
		children
	}: {
		title: string;
		meta?: string;
		open?: boolean;
		/** Lands on the `BlockTitle`, for callers that need a tighter rhythm than
		 *  the page default — a sidebar, say. */
		class?: string;
		/** For callers whose open-state lives somewhere `bind:` cannot reach — a
		 *  set of expanded ids, say, rather than one boolean per section. */
		onToggle?: (open: boolean) => void;
		titleClass?: string;
		children: Snippet;
	} = $props();

	const region = $props.id();

	function toggle() {
		open = !open;
		onToggle?.(open);
	}
</script>

<BlockTitle class={className}>
	<button
		class="flex items-center gap-1.5 {titleClass}"
		aria-expanded={open}
		aria-controls={region}
		onclick={toggle}
	>
		<Glyph
			name="chevron"
			size={12}
			class="opacity-45 transition-transform {open ? 'rotate-90' : ''}"
		/>
		<span>{title}</span>
	</button>
	{#if meta}
		<span class="text-[13px] font-normal opacity-50">{meta}</span>
	{/if}
</BlockTitle>

<div id={region} hidden={!open}>
	{@render children()}
</div>
