<script lang="ts">
	import { onMount } from 'svelte';
	import { appearance } from '$lib/appearance.svelte';
	import { Session } from '$lib/langchunk/session.svelte';
	import DesktopApp from '$lib/desktop/DesktopApp.svelte';
	import MobileApp from '$lib/mobile/MobileApp.svelte';

	/*
		One session, two shells.

		The session is built here rather than inside either shell so that switching
		between them — by resizing the window or by pinning a layout — keeps the
		text, the language and the analysis. Losing your work because you made the
		window narrower would be its own kind of bug.
	*/
	const session = new Session();

	onMount(() => session.refresh());

	// ⌘↵ / Ctrl+↵ from anywhere, the way a desktop app does it. Bound at the
	// document so it works while the caret is in the text area, which is where it
	// will nearly always be.
	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			session.process();
		}
	}
</script>

<svelte:document onkeydown={onKeydown} />

{#if appearance.desktop}
	<DesktopApp {session} />
{:else}
	<MobileApp {session} />
{/if}
