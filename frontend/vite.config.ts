import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Static output, deliberately. The app is fully client-side
			// (`ssr = false` in routes/+layout.ts — which layout to draw depends on
			// the window and localStorage), and the analysis lives in the user's
			// *local* service, so the deployable is nothing but files. The SPA
			// fallback serves index.html for any path; browsers exempt
			// http://localhost from mixed-content blocking, which is what lets the
			// HTTPS-deployed page talk to the local server on :8787.
			adapter: adapter({ fallback: 'index.html' }),

			// GitHub Pages serves a project site under /<repo>/; anything else
			// leaves this empty. The cast narrows the env string to SvelteKit's
			// `'' | /${string}` — a wrong value fails the build loudly, not here.
			paths: { base: (process.env.BASE_PATH ?? '') as '' | `/${string}` }
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
