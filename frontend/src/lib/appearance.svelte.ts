/**
 * Which arrangement the app is in, and how dark it is.
 *
 * *Layout* decides between the two-column arrangement and the single column.
 * It is purely responsive — it follows the window and re-decides the moment the
 * window changes, with no control anywhere in the interface. The stored
 * override still works and is still honoured; it is a lever for a test or a
 * console, not a setting anyone is asked to think about.
 *
 * *Theme* is the one that is exposed, because the system preference is genuinely
 * wrong for some people some of the time — anyone working next to a window. It
 * defaults to following the machine and remembers a pin.
 */

import { browser } from '$app/environment';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type LayoutChoice = 'auto' | 'desktop' | 'mobile';

export const THEME_CHOICES = ['system', 'light', 'dark'] as const;
export const LAYOUT_CHOICES = ['auto', 'desktop', 'mobile'] as const;

/**
 * Narrower than this and the desktop layout has nowhere to put its sidebar
 * without squeezing the analysis into a column too narrow to read.
 */
export const DESKTOP_MIN_WIDTH = 1000;

const THEME_KEY = 'langchunk.theme';
const LAYOUT_KEY = 'langchunk.layout';

function readChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
	if (!browser) return fallback;
	try {
		const stored = localStorage.getItem(key);
		return allowed.includes(stored as T) ? (stored as T) : fallback;
	} catch {
		// Private browsing, or storage turned off. A preference that cannot be
		// remembered is not a reason to fail to start.
		return fallback;
	}
}

function writeChoice(key: string, value: string) {
	if (!browser) return;
	try {
		localStorage.setItem(key, value);
	} catch {
		/* see above */
	}
}

function watch(query: string, onChange: (matches: boolean) => void): boolean {
	if (!browser) return false;
	const media = window.matchMedia(query);
	media.addEventListener('change', (event) => onChange(event.matches));
	return media.matches;
}

class Appearance {
	#theme = $state<ThemeChoice>('system');
	#layout = $state<LayoutChoice>('auto');
	#systemPrefersDark = $state(false);
	#viewportIsWide = $state(true);
	#reducedMotion = $state(false);

	constructor() {
		this.#theme = readChoice(THEME_KEY, THEME_CHOICES, 'system');
		this.#layout = readChoice(LAYOUT_KEY, LAYOUT_CHOICES, 'auto');
		this.#systemPrefersDark = watch(
			'(prefers-color-scheme: dark)',
			(matches) => (this.#systemPrefersDark = matches)
		);
		this.#viewportIsWide = watch(
			`(min-width: ${DESKTOP_MIN_WIDTH}px)`,
			(matches) => (this.#viewportIsWide = matches)
		);
		this.#reducedMotion = watch(
			'(prefers-reduced-motion: reduce)',
			(matches) => (this.#reducedMotion = matches)
		);
	}

	get theme(): ThemeChoice {
		return this.#theme;
	}

	set theme(choice: ThemeChoice) {
		this.#theme = choice;
		writeChoice(THEME_KEY, choice);
	}

	get layout(): LayoutChoice {
		return this.#layout;
	}

	set layout(choice: LayoutChoice) {
		this.#layout = choice;
		writeChoice(LAYOUT_KEY, choice);
	}

	/** Resolved: what the interface should actually paint right now. */
	get dark(): boolean {
		return this.#theme === 'system' ? this.#systemPrefersDark : this.#theme === 'dark';
	}

	get desktop(): boolean {
		return this.#layout === 'auto' ? this.#viewportIsWide : this.#layout === 'desktop';
	}

	get reducedMotion(): boolean {
		return this.#reducedMotion;
	}
}

export const appearance = new Appearance();
