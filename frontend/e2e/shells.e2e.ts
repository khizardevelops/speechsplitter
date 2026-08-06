/**
 * Which interface you get, and how dark it is.
 *
 * Two shells that share a session is the kind of arrangement that quietly rots:
 * a preference stops being read, a breakpoint stops firing, and nobody notices
 * because the shell they use still works. These pin down the contract — the root
 * element carries `data-shell` and `class="dark"`, both shells honour a pinned
 * choice, and a pin survives a reload.
 */

import { expect, test, type Page } from '@playwright/test';

const SERVER = 'http://localhost:8787';

async function stubServer(page: Page) {
	await page.route(`${SERVER}/api/languages`, (route) =>
		route.fulfill({
			json: {
				languages: [
					{
						code: 'en',
						name: 'English',
						nativeName: 'English',
						installed: true,
						runnable: true,
						activeRuntime: 'stanza',
						accuracy: {
							clauseF1: 0.9227,
							phraseF1: 0.946,
							wordF1: 0.973,
							sentences: 300,
							treebank: 'en_ewt'
						},
						downloadBytes: 0,
						downloadLabel: null,
						requires: null,
						variants: []
					}
				]
			}
		})
	);
}

const root = (page: Page) => page.locator('html');

test('a wide window gets the desktop shell', async ({ page }) => {
	await stubServer(page);
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');

	await expect(root(page)).toHaveAttribute('data-shell', 'desktop');
	// The sidebar is the structural difference, not a cosmetic one.
	await expect(page.getByRole('complementary', { name: 'Library' })).toBeVisible();
});

test('a narrow window gets the mobile shell', async ({ page }) => {
	await stubServer(page);
	await page.setViewportSize({ width: 420, height: 860 });
	await page.goto('/');

	await expect(root(page)).toHaveAttribute('data-shell', 'mobile');
	await expect(page.getByRole('complementary', { name: 'Library' })).toHaveCount(0);
});

test('the layout follows the window as it changes', async ({ page }) => {
	// Responsive, not a setting: no control anywhere chooses this, so the only
	// thing that can be wrong is whether it re-decides while the window moves.
	await stubServer(page);
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');
	await expect(root(page)).toHaveAttribute('data-shell', 'desktop');

	await page.setViewportSize({ width: 420, height: 860 });
	await expect(root(page)).toHaveAttribute('data-shell', 'mobile');

	await page.setViewportSize({ width: 1280, height: 800 });
	await expect(root(page)).toHaveAttribute('data-shell', 'desktop');
});

test('a layout pinned in settings outlives the window and a reload', async ({ page }) => {
	// The picker was removed 2026-08-05 and restored at the owner's request the
	// next day. The point of pinning: a 1280-pixel window is wide enough for the
	// two-column layout, and someone can still prefer the phone one.
	await stubServer(page);
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');
	await expect(root(page)).toHaveAttribute('data-shell', 'desktop');

	await page.getByLabel('Settings').click();
	// Konsta's segmented control is a group of toggle buttons — its Button
	// hard-codes role="button" — so this clicks rather than checks.
	await page.getByRole('button', { name: 'Mobile' }).click();
	await expect(root(page)).toHaveAttribute('data-shell', 'mobile');

	// Still mobile after a reload, and after the window gets wider still.
	await page.reload();
	await expect(root(page)).toHaveAttribute('data-shell', 'mobile');
	await page.setViewportSize({ width: 1600, height: 900 });
	await expect(root(page)).toHaveAttribute('data-shell', 'mobile');

	// Automatic hands control back to the window.
	await page.getByLabel('Settings').click();
	await page.getByRole('button', { name: 'Automatic' }).click();
	await expect(root(page)).toHaveAttribute('data-shell', 'desktop');
});

test('a stored layout override still wins over the window', async ({ page }) => {
	// The storage-level contract behind the picker. If the stored value ever
	// stops being read before first paint, this is what says so.
	await stubServer(page);
	await page.addInitScript(() => localStorage.setItem('langchunk.layout', 'mobile'));
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');

	await expect(root(page)).toHaveAttribute('data-shell', 'mobile');
});

test('a pinned theme overrides the system preference', async ({ page }) => {
	await stubServer(page);
	await page.emulateMedia({ colorScheme: 'light' });
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');
	await expect(root(page)).not.toHaveClass(/dark/);

	await page.getByLabel('Settings').click();
	await page.getByRole('button', { name: 'Dark' }).click();
	await expect(root(page)).toHaveClass(/dark/);

	// And survives a reload, applied before the first paint rather than after
	// hydration — otherwise the page flashes light on every load.
	await page.reload();
	await expect(root(page)).toHaveClass(/dark/);
});

test('the system theme is followed when nothing is pinned', async ({ page }) => {
	await stubServer(page);
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');

	await expect(root(page)).toHaveClass(/dark/);
});

test('the session survives a change of shell', async ({ page }) => {
	// Both shells read one session. Losing your text because you narrowed the
	// window would be its own kind of bug.
	await stubServer(page);
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');

	await page.getByPlaceholder(/weather is nice/i).fill('The dog barked.');
	await page.setViewportSize({ width: 420, height: 860 });

	await expect(root(page)).toHaveAttribute('data-shell', 'mobile');
	await expect(page.getByPlaceholder(/weather is nice/i)).toHaveValue('The dog barked.');
});
