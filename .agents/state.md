# LangChunk App — State

## Current status

Created 2026-08-06 by splitting the original monorepo (engine repo decision
§V4-71): the engine stayed at github.com/khizardevelops/langchunk and ships as
the npm package `langchunk`; this repo holds everything application. All code
here predates the split and is battle-tested — only the plumbing is new:

- Engine imports rewritten from `@langchunk/X` workspace specifiers to
  `langchunk/X` subpaths (`analyzer-stanza` → `langchunk/analyzers/stanza`,
  `schema/validators` → `langchunk/validators`).
- `@langchunk/packs` and `@langchunk/corrections` remain **local** workspace
  packages — private, never published; their scoped names are historical.
- Apps that use the ONNX analyzer (server, cli, tui) declare
  `onnxruntime-node` + `@huggingface/transformers` themselves: the engine
  lists them as optional peers so plain consumers don't download a 100 MB
  runtime.
- `tests/frontend-mirror.test.ts` guards the frontend's three hand-copies
  (`csv.ts`, `jsonl.ts`, `types.ts`) against the **installed** package —
  behaviour-compared for the exporters; field-name-compared against the
  bundled `.d.ts` (found by content, its chunk name is hashed) plus
  `SCHEMA_VERSION` for the schema. CSV/JSONL checks skip unless
  `frontend/.svelte-kit/` exists; CI syncs the tree so they run for real.

## The frontend is two layouts over one set of components

One design system — Konsta's iOS theme — and two arrangements chosen by window
width, with an Automatic/Desktop/Mobile pin in Settings:

```
frontend/src/lib/
  components/     every visible piece, shared verbatim by both layouts
  desktop/DesktopApp.svelte   two Konsta Pages side by side: library + detail
  mobile/MobileApp.svelte     one scrolling Page
  langchunk/session.svelte.ts all state and actions, shared by both
  langchunk/outline.ts        ParsedDocument → the nested shape both render
  appearance.svelte.ts        theme + layout resolution, persisted
```

Neither shell styles anything. **No per-layout font sizes or surface colours —
adding any is a regression**; two attempts at a distinct desktop skin were
built and rejected by the owner (engine repo §V4-64 has the history).
`ssr = false` because layout choice needs the window and localStorage.

`svelte-check` clean; unit tests (vitest, `--project server`) and 17 e2e tests
green (stubbed service — they need no model and no server).

## The server

`/api/languages` (model-pack catalogue + pack-only languages listed
unavailable-with-reason), `/api/install` (streamed progress, SHA-256 verified,
staged-then-committed), `/api/analyze`, `/api/corrections` (append-only JSONL
at `~/.langchunk/corrections.jsonl`). Runtime per language is chosen on
**measured accuracy** from the pack manifests, never hardcoded.

## Key invariants

- **The frontend must not import from the pnpm workspace or the engine repo.**
  It is installed with bun and mirrors three files by hand; the mirror suite
  is what makes that safe.
- **A layout may arrange components; it may never re-skin them.**
- **A downloaded pack is SHA-256-verified, staged, then committed.** A
  truncated model loads and then behaves strangely.
- **A pack's advertised accuracy comes from a measurement** (the engine's
  committed reports), never a hand-typed literal.
- **A correction can never become evidence** — fixture skeletons ship with
  expected output blank and `unreviewed`.
- **Engine version bumps are deliberate.** The dep is `"langchunk": "^0.1.0"`;
  an accuracy-affecting engine change arrives by publishing there and bumping
  here, with the changelog read.

## What is missing

- Nothing downloads/installs the local service itself; the app explains how to
  start it. Open packaging question (binary? npx? installer?).
- Pack hosting: `dist-packs/` is built in the engine repo and served locally;
  `LANGCHUNK_REGISTRY` can point anywhere static, but no public host exists.
