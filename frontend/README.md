# speechsplitter web app

The interface over the local analysis service: paste text, pick a language,
and read it back as sentences, clauses, phrases and words — every unit
traceable to the exact characters it came from.

This directory is deliberately **outside the pnpm workspace** and installed
with **bun**. The app must never import from the analysis packages — it talks
to `apps/server` over HTTP and mirrors the three files it needs
(`src/lib/langchunk/{types,csv,jsonl}.ts`) by hand, with
`packages/export/test/frontend-mirror.test.ts` failing the workspace build if
the copies ever drift in behaviour.

## Run it

```sh
# in the repository root, in another shell — the analysis service
pnpm run build && pnpm run server        # http://localhost:8787

# here
bun install
bun run dev                              # http://localhost:5173
```

Without the service running, the app opens with a dialog explaining exactly
that — it is the ordinary first-run state, not an error.

`VITE_LANGCHUNK_SERVER` overrides where the app looks for the service
(default `http://localhost:8787`). This also makes the *deployed* app work:
browsers exempt `http://localhost` from mixed-content blocking, so the
HTTPS-hosted page can talk to the service on your own machine.

## Design

One set of Konsta UI (iOS theme) components, two arrangements of it:

- `src/lib/components/` — every visible piece, shared verbatim by both layouts
- `src/lib/desktop/` — two Konsta Pages side by side (library + detail),
  used when the window is ≥ 1000 px
- `src/lib/mobile/` — one scrolling column
- `src/lib/langchunk/session.svelte.ts` — all state and actions, shared, so
  resizing across the breakpoint never loses your text or analysis
- `src/lib/appearance.svelte.ts` — theme (System/Light/Dark) and layout
  (Automatic/Desktop/Mobile), both persisted and applied before first paint

A layout arranges components; it never re-skins them. The reasoning — and two
rejected designs — are recorded in `.agents/decisions.md` §V4-64 – §V4-67.

## Checks

```sh
bun run check              # svelte-check
bun run test:unit -- --run # vitest
bun run test:e2e           # playwright; stubs the service, needs no model
bun run lint               # prettier + eslint
```

## Build

```sh
bun run build              # static site in build/ (adapter-static, SPA fallback)
BASE_PATH=/speechsplitter bun run build   # for GitHub Pages project hosting
```
