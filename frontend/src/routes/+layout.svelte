<script lang="ts">
	import './layout.css';
	import { appearance } from '$lib/appearance.svelte';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	/**
	 * The root element carries both decisions.
	 *
	 * `dark` because that is where Konsta, Tailwind and the Mac tokens all look
	 * for it; `data-shell` because the body background belongs to whichever shell
	 * is running, and the body is outside every component.
	 */
	$effect(() => {
		const root = document.documentElement;
		root.classList.toggle('dark', appearance.dark);
		root.dataset.shell = appearance.desktop ? 'desktop' : 'mobile';
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>LangChunk</title>
	<meta
		name="description"
		content="Break text into sentences, clauses, phrases, and words — each traceable to the characters it came from."
	/>
</svelte:head>

{@render children()}
