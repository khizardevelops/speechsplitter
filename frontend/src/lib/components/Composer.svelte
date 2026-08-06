<script lang="ts">
	import {
		Block,
		BlockFooter,
		BlockTitle,
		Button,
		List,
		ListButton,
		ListInput,
		Preloader
	} from 'konsta/svelte';
	import { placeholderFor } from '$lib/placeholders';
	import { processShortcut } from '$lib/platform';
	import type { Session } from '$lib/langchunk/session.svelte';

	let { session }: { session: Session } = $props();

	/**
	 * The line under the button.
	 *
	 * One place, so the states cannot overlap and the reader is never told two
	 * things at once. It is an `aria-live` region, which is how someone who
	 * cannot see the button change colour learns that the analysis finished.
	 */
	const status = $derived.by(() => {
		if (session.serverDown) return 'Waiting for the local service';
		if (!session.ready) return `Install ${session.current?.nativeName ?? 'a language'} to begin`;
		if (session.processing) return 'Processing…';
		if (session.text.trim().length === 0) return 'Nothing to process yet';
		if (session.result) return 'Analysis is up to date';
		return `Ready — ${processShortcut} to process`;
	});
</script>

<BlockTitle>
	<span>Text</span>
	<span class="text-[13px] font-normal opacity-50">
		{#if session.text.length > 0}{session.text.length} characters{/if}
	</span>
</BlockTitle>

<List strong inset>
	<!--
		No `clearButton`: Konsta pins it to the vertical centre of the field, which
		is right for a one-line input and lands in the middle of a textarea. A list
		row underneath is where iOS puts that action anyway.
	-->
	<ListInput
		type="textarea"
		placeholder={placeholderFor(session.selected)}
		disabled={!session.ready}
		spellcheck="false"
		inputClass="resize-none leading-relaxed"
		inputStyle="height: 8.5rem"
		bind:value={session.text}
		onInput={() => session.invalidate()}
	/>
	{#if session.text.length > 0}
		<ListButton onClick={() => session.clearText()}>Clear</ListButton>
	{/if}
</List>

<Block inset class="my-6">
	<Button large rounded disabled={!session.canProcess} onClick={() => session.process()}>
		{#if session.processing}
			<Preloader class="me-2 h-5 w-5" colors={{ iconIos: 'text-white' }} />
			Processing
		{:else}
			Process
		{/if}
	</Button>
</Block>

<BlockFooter inset class="justify-center text-center">
	<span aria-live="polite">{status}</span>
</BlockFooter>
