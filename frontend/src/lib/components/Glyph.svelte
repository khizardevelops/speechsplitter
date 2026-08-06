<script lang="ts">
	/**
	 * The small set of symbols both shells use.
	 *
	 * Drawn rather than imported: nine glyphs do not justify an icon package, and
	 * having them here means they are all on one grid. That grid matters — the
	 * previous info button was visibly off-centre because its glyph was balanced
	 * around the wrong axis and then sat on a text baseline inside an
	 * `inline-block` wrapper. Everything below is symmetric about the centre of a
	 * 16×16 box, and the `<svg>` is `block`, so there is no baseline gap under it.
	 */

	export type GlyphName =
		'info' | 'gear' | 'chevron' | 'download' | 'copy' | 'check' | 'close' | 'dot' | 'spinner';

	let {
		name,
		size = 16,
		class: className = ''
	}: { name: GlyphName; size?: number; class?: string } = $props();
</script>

<svg
	class="block shrink-0 {className}"
	width={size}
	height={size}
	viewBox="0 0 16 16"
	fill="none"
	stroke="currentColor"
	stroke-width="1.4"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	{#if name === 'info'}
		<!-- Glyph spans 4.05–11.95, centred on 8, inside a ring centred on 8. -->
		<circle cx="8" cy="8" r="6.6" />
		<circle cx="8" cy="4.9" r="0.5" fill="currentColor" stroke="none" />
		<path d="M8 7.3v4.65" />
	{:else if name === 'gear'}
		<circle cx="8" cy="8" r="2.15" />
		<path
			d="M8 1.5l.75 1.6 1.75-.45.35 1.78 1.78.35-.45 1.75L13.5 8l-1.32 1.47.45 1.75-1.78.35-.35 1.78-1.75-.45L8 14.5l-.75-1.6-1.75.45-.35-1.78-1.78-.35.45-1.75L2.5 8l1.32-1.47-.45-1.75 1.78-.35.35-1.78 1.75.45z"
		/>
	{:else if name === 'chevron'}
		<path d="M6 3.5L10.5 8 6 12.5" />
	{:else if name === 'download'}
		<path d="M8 2.5v7.2" />
		<path d="M5 6.9L8 9.9l3-3" />
		<path d="M2.8 12.2h10.4" />
	{:else if name === 'copy'}
		<rect x="5.6" y="5.6" width="7.6" height="7.6" rx="1.8" />
		<path d="M10.4 3.4a1.8 1.8 0 00-1.8-1.8H4.6a3 3 0 00-3 3v4a1.8 1.8 0 001.8 1.8" />
	{:else if name === 'check'}
		<path d="M3 8.4l3.3 3.3L13 4.6" stroke-width="1.7" />
	{:else if name === 'close'}
		<path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />
	{:else if name === 'dot'}
		<circle cx="8" cy="8" r="3.4" fill="currentColor" stroke="none" />
	{:else if name === 'spinner'}
		<!-- One arc that turns, rather than eight fading spokes: fewer moving
		     parts, and `prefers-reduced-motion` stops it from the base layer. -->
		<circle cx="8" cy="8" r="5.8" opacity="0.25" />
		<path d="M8 2.2a5.8 5.8 0 015.8 5.8">
			<animateTransform
				attributeName="transform"
				type="rotate"
				from="0 8 8"
				to="360 8 8"
				dur="0.7s"
				repeatCount="indefinite"
			/>
		</path>
	{/if}
</svg>
