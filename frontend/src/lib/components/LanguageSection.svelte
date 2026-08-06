<script lang="ts">
	import { BlockFooter, BlockTitle, List, ListItem, Preloader } from 'konsta/svelte';
	import LanguageRows from './LanguageRows.svelte';
	import type { Session } from '$lib/langchunk/session.svelte';

	let { session }: { session: Session } = $props();
</script>

<BlockTitle>
	<span>Language</span>
	{#if !session.loadingLanguages && session.languages.length > 0}
		<span class="text-[13px] font-normal opacity-50">
			{session.installedCount} of {session.languages.length} installed
		</span>
	{/if}
</BlockTitle>

<List strong inset dividers>
	{#if session.loadingLanguages}
		<ListItem title="Checking what is installed…">
			{#snippet media()}
				<Preloader class="h-6 w-6" />
			{/snippet}
		</ListItem>
	{:else if session.serverDown}
		<!--
			Distinct from "no packs published": the list is empty because nothing
			answered, not because nothing exists. Saying the wrong one sends someone
			off to build packs they already have.
		-->
		<ListItem title="Waiting for the service" subtitle="Nothing to choose from until it answers" />
	{:else if session.languages.length === 0}
		<ListItem title="No language packs published" subtitle="Build them with pnpm run packs:build" />
	{:else}
		<LanguageRows {session} />
	{/if}
</List>

{#if !session.loadingLanguages && session.languages.length > 0}
	<BlockFooter inset>
		Each language is downloaded once and stays on this computer. Nothing is sent anywhere.
	</BlockFooter>
{/if}
