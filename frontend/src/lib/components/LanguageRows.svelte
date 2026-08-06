<script lang="ts">
	import { Badge, Button, ListItem, Preloader, Progressbar, Radio } from 'konsta/svelte';
	import type { LanguageStatus } from '$lib/langchunk/client';
	import type { Session } from '$lib/langchunk/session.svelte';

	let { session }: { session: Session } = $props();

	function megabytes(bytes: number): string {
		return `${Math.round(bytes / 1048576)} MB`;
	}

	/**
	 * The one line under the name.
	 *
	 * For an installed pack that is its measured clause accuracy, shown because it
	 * differs sharply between languages and someone deciding whether to trust a
	 * result should see it before they read one, not after. For everything else it
	 * is the cost of getting there.
	 */
	function statusOf(language: LanguageStatus): string {
		if (language.installed && language.accuracy) {
			const measured = `${Math.round(language.accuracy.clauseF1 * 100)}% clause accuracy`;
			return language.activeRuntime ? `${measured} · ${language.activeRuntime}` : measured;
		}
		if (language.requires && !language.runnable) return `Needs ${language.requires}`;
		if (language.downloadLabel) return `${language.downloadLabel} download`;
		return 'Not installed';
	}

	function removable(language: LanguageStatus): boolean {
		return language.variants.some((variant) => variant.installed && variant.bytes > 0);
	}
</script>

{#each session.languages as language (language.code)}
	<!--
		`label` makes the whole row the radio's label, which is how a Konsta list
		does a single choice: no click handler on a div, no nested buttons, and the
		hit target is the 44-pixel row rather than the 22-pixel circle. The install
		control sits in `after`; a click on it does not reach the label, because
		label activation skips interactive targets.
	-->
	<ListItem
		label
		title={language.nativeName}
		subtitle={statusOf(language)}
		footer={session.installing === language.code && session.installProgress ? progress : ''}
	>
		{#snippet media()}
			<!--
				`component="div"`: Konsta's Radio is a <label> by default, and this one
				is already inside the row's label. The outer one still finds the input,
				so the behaviour is unchanged and the markup stays valid.
			-->
			<Radio
				component="div"
				name="language"
				value={language.code}
				checked={language.code === session.selected}
				onChange={() => session.select(language.code)}
			/>
		{/snippet}

		{#snippet after()}
			{#if session.installing === language.code}
				<Preloader class="h-6 w-6" />
			{:else if !language.runnable}
				<Badge
					colors={{ bg: 'bg-black/10 dark:bg-white/15', text: 'text-black/50 dark:text-white/50' }}
				>
					Unavailable
				</Badge>
			{:else if !language.installed}
				<Button small rounded inline class="px-4" onClick={() => session.install(language.code)}>
					Download
				</Button>
			{:else if removable(language)}
				<Button
					small
					clear
					inline
					colors={{
						textIos: 'text-[var(--danger)]',
						clearBgIos: 'bg-transparent active:bg-[var(--danger)]/15'
					}}
					onClick={() => session.remove(language.code)}
				>
					Remove
				</Button>
			{/if}
		{/snippet}
	</ListItem>
{/each}

{#if session.packError}
	<ListItem
		title={session.packError}
		titleFontSizeIos="text-[15px]"
		colors={{ primaryTextIos: 'text-[var(--danger)]' }}
	/>
{/if}

<!--
	Declared once rather than per row: only one language installs at a time, so
	the progress it reads is session state, not row state.
-->
{#snippet progress()}
	<span class="block pt-1.5 pb-0.5">
		<Progressbar progress={session.installFraction} />
	</span>
	{#if session.installProgress?.phase === 'verifying'}
		Verifying {session.installProgress.file}…
	{:else if session.installProgress}
		{megabytes(session.installProgress.received)} of {megabytes(session.installProgress.total)}
	{/if}
{/snippet}
