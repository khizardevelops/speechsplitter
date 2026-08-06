<script lang="ts">
	import {
		App,
		Block,
		BlockFooter,
		Dialog,
		DialogButton,
		Link,
		List,
		ListItem,
		Navbar,
		Page,
		Popover,
		Segmented,
		SegmentedButton
	} from 'konsta/svelte';
	import AnalysisSection from '$lib/components/AnalysisSection.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import Disclosure from '$lib/components/Disclosure.svelte';
	import Glyph from '$lib/components/Glyph.svelte';
	import LanguageSection from '$lib/components/LanguageSection.svelte';
	import { appearance, type LayoutChoice, type ThemeChoice } from '$lib/appearance.svelte';
	import { serverUrl } from '$lib/langchunk/client';
	import { processShortcut } from '$lib/platform';
	import type { Session } from '$lib/langchunk/session.svelte';

	let { session }: { session: Session } = $props();

	let settingsTarget = $state<HTMLElement | null>(null);
	let settingsOpen = $state(false);
	let engineOpen = $state(false);

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

	const accuracy = $derived(session.current?.accuracy ?? null);

	const facts = $derived(
		accuracy
			? ([
					['Runtime', session.current?.activeRuntime ?? '—'],
					['Clause F1', accuracy.clauseF1.toFixed(4)],
					['Phrase F1', accuracy.phraseF1.toFixed(4)],
					['Word F1', accuracy.wordF1.toFixed(4)],
					['Measured on', `${accuracy.sentences} sentences`],
					['Treebank', accuracy.treebank]
				] as const)
			: []
	);

	// Esc closes whatever is on top, innermost first.
	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		if (session.error) session.error = null;
		else if (session.serverDown) session.serverDown = false;
		else if (settingsOpen) settingsOpen = false;
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!--
	The wide layout is a split view: two Konsta `Page`s side by side, each with the
	navigation bar and grouped lists it would have on its own. Nothing here is
	styled differently from the phone shell — same components, same sizes, same
	theme. What changes is that the library gets its own column instead of sitting
	above the text, which is the whole reason a wide window is worth having.
-->
<App theme="ios" safeAreas={false} class="fixed inset-0 flex overflow-hidden">
	<!-- `aside`, so the library is a complementary landmark rather than an
	     anonymous column: it is beside the work, not part of it. -->
	<aside
		class="relative w-[340px] flex-none border-e border-black/10 dark:border-white/15"
		aria-label="Library"
	>
		<Page>
			<Navbar title="Library" />

			<LanguageSection {session} />

			<Disclosure title="Engine" bind:open={engineOpen}>
				{#if facts.length > 0}
					<List strong inset dividers>
						{#each facts as [label, value] (label)}
							<ListItem title={label} after={value} />
						{/each}
					</List>
				{:else}
					<BlockFooter inset>Install a language to see what it was measured at.</BlockFooter>
				{/if}
			</Disclosure>

			<BlockFooter inset class="mt-8">
				{#if session.serverDown}
					Waiting for the local service.
				{:else if session.loadingLanguages}
					Connecting…
				{:else}
					Service running. Everything stays on this computer.
				{/if}
			</BlockFooter>
		</Page>
	</aside>

	<div class="relative min-w-0 flex-1">
		<Page>
			<Navbar title="LangChunk" subtitle="Sentences, clauses, phrases, words">
				{#snippet right()}
					<!--
						One control, and its anchor has to keep its own height.

						Konsta wraps the whole `right` snippet in a single Glass capsule, so
						a second button would not get its own pill — it would share this one
						and stretch it into a blob. What was behind the info button lives
						inside this popover instead.

						`flex h-full` on the wrapper, not a bare span: Konsta sizes a
						navbar's icon Link with `h-full aspect-square`, so it takes the
						bar's 44 pixels and comes out round. A wrapper with no height of its
						own breaks that chain — `h-full` resolves against the wrapper, the
						Link collapses to the icon, and the capsule, still 44 tall, becomes
						a vertical pill. The wrapper exists only because the Popover needs
						something to anchor to, and `display: contents` would remove the box
						it measures.
					-->
					<span bind:this={settingsTarget} class="flex h-full">
						<Link
							iconOnly
							aria-label="Settings"
							aria-expanded={settingsOpen}
							onClick={() => (settingsOpen = !settingsOpen)}
						>
							<Glyph name="gear" size={22} />
						</Link>
					</span>
				{/snippet}
			</Navbar>

			<!-- Wide enough for a clause tree, capped so a full-screen window does not
			     stretch a line of prose past the point the eye can track, and centred
			     under the navigation bar's own centred title. -->
			<div class="mx-auto max-w-[56rem]">
				<Composer {session} />
				<AnalysisSection {session} />
			</div>
		</Page>
	</div>

	<Popover
		angle
		opened={settingsOpen}
		target={settingsTarget}
		onBackdropClick={() => (settingsOpen = false)}
		class="w-80"
	>
		<!--
			One Block rather than the BlockTitle/Block pairs used on a page.
			`BlockTitle` pulls itself down onto the block that follows it with a
			`has-[+.k-block]:-mb-6`, arithmetic that only works against a Block's
			default margins — inside a popover, where they have to be tight, the two
			collide and the heading lands on top of the control.
		-->
		<Block class="my-4 space-y-4">
			<div>
				<div class="mb-2 flex items-baseline justify-between gap-3">
					<span class="font-semibold">Appearance</span>
					<span class="text-[13px] opacity-50">
						{appearance.theme === 'system' ? 'Following the system' : 'Pinned'}
					</span>
				</div>
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
			</div>

			<div>
				<div class="mb-2 flex items-baseline justify-between gap-3">
					<span class="font-semibold">Layout</span>
					<span class="text-[13px] opacity-50">
						{appearance.layout === 'auto' ? 'Follows the window' : 'Pinned'}
					</span>
				</div>
				<!--
					Restored at the owner's request (2026-08-06) after being removed the
					day before — the stored preference stayed alive throughout, so this
					is only the control coming back. Automatic still re-decides on every
					resize; a pin ignores the window until set back.
				-->
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
			</div>

			<div class="space-y-2 border-t border-black/8 pt-4 text-[14px] dark:border-white/10">
				<p>
					LangChunk breaks text into four levels at once — sentences, clauses, phrases, words — and
					keeps every unit tied to the characters it came from.
				</p>
				<p class="opacity-50">
					Everything runs locally; no text leaves this machine. {processShortcut} processes from anywhere,
					Esc closes.
				</p>
			</div>
		</Block>
	</Popover>

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
		{#snippet title()}The LangChunk service is not running{/snippet}

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
