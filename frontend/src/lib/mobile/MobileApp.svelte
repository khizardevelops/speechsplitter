<script lang="ts">
	import {
		App,
		Block,
		BlockFooter,
		BlockTitle,
		Dialog,
		DialogButton,
		Link,
		Navbar,
		Page,
		Segmented,
		SegmentedButton,
		Sheet,
		Toolbar
	} from 'konsta/svelte';
	import AnalysisSection from '$lib/components/AnalysisSection.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import Glyph from '$lib/components/Glyph.svelte';
	import LanguageSection from '$lib/components/LanguageSection.svelte';
	import { appearance, type LayoutChoice, type ThemeChoice } from '$lib/appearance.svelte';
	import { serverUrl } from '$lib/langchunk/client';
	import type { Session } from '$lib/langchunk/session.svelte';

	let { session }: { session: Session } = $props();

	let settingsOpen = $state(false);

	const THEME_OPTIONS = [
		{ value: 'system', label: 'System' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	] as const satisfies ReadonlyArray<{ value: ThemeChoice; label: string }>;

	const LAYOUT_OPTIONS = [
		{ value: 'auto', label: 'Automatic' },
		{ value: 'desktop', label: 'Desktop' },
		{ value: 'mobile', label: 'Mobile' }
	] as const satisfies ReadonlyArray<{ value: LayoutChoice; label: string }>;
</script>

<!--
	One column, the way a phone app is. The width cap is what keeps it looking
	like one when the layout is pinned to Mobile in a wide window: Konsta lays out
	44-pixel rows and inset groups, and stretched across a monitor those same
	components stop reading as an app — which is what the wide layout is for.
-->
<App theme="ios" class="mx-auto max-w-[600px] shadow-[0_0_60px_rgba(0,0,0,0.18)]">
	<Page>
		<Navbar large title="speechsplitter" subtitle="Sentences, clauses, phrases, words">
			{#snippet right()}
				<Link iconOnly aria-label="Settings" onClick={() => (settingsOpen = true)}>
					<Glyph name="gear" size={22} />
				</Link>
			{/snippet}
		</Navbar>

		<LanguageSection {session} />
		<Composer {session} />
		<AnalysisSection {session} />
	</Page>

	<Sheet
		class="w-full pb-safe"
		opened={settingsOpen}
		onBackdropClick={() => (settingsOpen = false)}
	>
		<Toolbar top>
			<div class="flex w-full items-center justify-between">
				<span class="text-[17px] font-semibold">Settings</span>
				<Link onClick={() => (settingsOpen = false)}>Done</Link>
			</div>
		</Toolbar>

		<BlockTitle>
			<span>Appearance</span>
			<span class="text-[13px] font-normal opacity-50">
				{appearance.theme === 'system' ? 'Following the system' : 'Pinned'}
			</span>
		</BlockTitle>
		<Block inset>
			<Segmented strong rounded role="group" aria-label="Appearance">
				{#each THEME_OPTIONS as option (option.value)}
					<SegmentedButton
						aria-pressed={appearance.theme === option.value}
						active={appearance.theme === option.value}
						onClick={() => (appearance.theme = option.value)}
					>
						{option.label}
					</SegmentedButton>
				{/each}
			</Segmented>
		</Block>

		<BlockTitle>
			<span>Layout</span>
			<span class="text-[13px] font-normal opacity-50">
				{appearance.layout === 'auto' ? 'Follows the window' : 'Pinned'}
			</span>
		</BlockTitle>
		<!--
			Restored at the owner's request (2026-08-06). Automatic still re-decides
			on every resize; a pin ignores the window until set back — which is how a
			wide window can deliberately keep this phone layout, or a narrow one
			preview the desktop arrangement.
		-->
		<Block inset>
			<Segmented strong rounded role="group" aria-label="Layout">
				{#each LAYOUT_OPTIONS as option (option.value)}
					<SegmentedButton
						aria-pressed={appearance.layout === option.value}
						active={appearance.layout === option.value}
						onClick={() => (appearance.layout = option.value)}
					>
						{option.label}
					</SegmentedButton>
				{/each}
			</Segmented>
		</Block>
		<BlockFooter inset>
			{#if appearance.layout === 'auto'}
				The two-column layout appears when the window is at least 1000 pixels wide.
			{:else}
				Pinned — the layout ignores the window width until this is set back to Automatic.
			{/if}
		</BlockFooter>

		<BlockFooter inset>
			speechsplitter breaks text into four levels at once — sentences, clauses, phrases, words — and
			keeps every unit tied to the characters it came from. It runs entirely on this computer; no
			text leaves the machine.
		</BlockFooter>
	</Sheet>

	<!--
		Both titles are snippets rather than strings. Konsta 5.3.0's Svelte Dialog
		calls `printText` on a string title without importing it, so a plain string
		throws; a snippet takes the other branch.
	-->
	<Dialog
		class="text-center"
		opened={session.serverDown}
		onBackdropClick={() => (session.serverDown = false)}
	>
		{#snippet title()}The speechsplitter service is not running{/snippet}

		<p>
			Analysis happens on your computer, not in the browser. Start it with
			<code class="rounded bg-black/10 px-1 dark:bg-white/15">pnpm run server</code>.
		</p>
		<p class="mt-2 opacity-50">Looking for {serverUrl()}</p>

		{#snippet buttons()}
			<DialogButton strong onClick={() => session.refresh()}>Try again</DialogButton>
		{/snippet}
	</Dialog>

	<Dialog
		class="text-center"
		opened={session.error !== null}
		onBackdropClick={() => (session.error = null)}
	>
		{#snippet title()}Analysis failed{/snippet}

		<p>{session.error}</p>

		{#snippet buttons()}
			<DialogButton strong onClick={() => (session.error = null)}>OK</DialogButton>
		{/snippet}
	</Dialog>
</App>
