# Last Session Handoff

## Date

2026-08-06 — this repo's first session: created by splitting the original
monorepo. The engine stayed at `../langchunk` (npm package `langchunk`,
published 0.1.0); everything application moved here.

## Naming and release-preparation update — 2026-08-08

- Renamed the local application directory to `speechsplitter`, changed public
  metadata/Pages links/UI labels/CLI and TUI branding, and set `origin` to
  `git@github.com:khizardevelops/speechsplitter.git`.
- The full AGPL-3.0 license remains the application license. Package imports
  remain `langchunk`, which is the separate MIT engine.
- Backend verification (49 tests), frontend Svelte checks, and the new CLI
  help surface passed. The rename already exists on GitHub and commit `5d65b51`
  (`Rename application to speechsplitter`) was pushed to `origin/main`.

## Subsequent diagnostic

- User reported every language unavailable despite the server loading the
  Pashto language-data pack. `GET /api/languages` proved the registry was
  empty: its default file URL targets the missing
  `backend/dist-packs/registry.json`. The split left the actual built registry
  at `../langchunk/dist-packs/registry.json`.
- This is not a broken parser pipeline. A temporary server launched with
  `LANGCHUNK_REGISTRY=file:///…/langchunk/dist-packs/registry.json` returned
  EN/RU model variants as runnable/downloadable immediately. No source or
  runtime configuration was changed in this diagnostic.

## What was done

- Physical move: `frontend/`, `apps/{server,cli,tui}`,
  `packages/{packs,corrections}`, `language-packs/` (gitignored runtime
  state), the Pages `deploy.yml`.
- Imports rewritten `@langchunk/X` → `langchunk/X` subpaths; analyzers at
  `langchunk/analyzers/{gold,agreement,stanza,onnx}`; `schema/validators` →
  `langchunk/validators`. `@langchunk/packs` and `@langchunk/corrections`
  stayed workspace-local.
- server/cli/tui declare `onnxruntime-node` + `@huggingface/transformers`
  (the engine's optional peers) so the ONNX path keeps working.
- New root: package.json (scripts: langchunk/server/tui/build/verify),
  pnpm-workspace.yaml (allowBuilds carried over), tsconfig.json (references:
  packs, corrections, cli, tui, server — cross-repo references removed),
  vitest.config.js (aliases only for the two local packages; the engine
  resolves through node_modules ON PURPOSE — tests exercise what a consumer
  installs).
- Mirror suite → `tests/frontend-mirror.test.ts` + `tests/fixtures.ts`:
  exporters compared by behaviour against `langchunk/export`; schema compared
  by field names against the installed package's bundled `.d.ts` (the chunk
  is found by content — its filename is hashed) and `SCHEMA_VERSION`.
- CI: workspace job (typecheck + tests, with a bun sync of `frontend/` so the
  mirror suite runs for real) + frontend job (svelte-check, unit, e2e).
  deploy.yml unchanged — BASE_PATH derives from the repo name.

## What to verify if something is off

`pnpm install && pnpm run verify` from the root, then
`cd frontend && bun install && bun run check && bun run test:e2e`. The first
install resolves `langchunk` from the public registry — if it fails, check
npm availability, not the workspace.

## Where to start next

`tasks.md`: nothing installs the local service (the owner-facing gap), then
pack hosting. Engine accuracy work (French span bug, English clause misses)
belongs in `../langchunk`.

## Subsequent boundary repair

- Moved the generated `dist-packs/` catalogue and ONNX payload from the engine
  checkout into `backend/dist-packs/`, the application server's default
  registry location. This restores the full language catalogue without
  `LANGCHUNK_REGISTRY` pointing at a sibling directory.
- The engine retains conversion tooling, source models, and measured reports;
  its pack builder now requires an explicit `LANGCHUNK_PACK_OUTPUT` and the app
  commands document the refresh path. No package source moved into the app.

## Subsequent Persian-output diagnosis

- Reproduced the malformed Saadi paste through `/api/analyze`. Missing word
  boundaries (`گوهرندچو`, `قرارتو`) and treating spaced `/` as ordinary text
  leave it as one sentence. Replacing them with real spaces and line breaks
  yields six proper sentence spans without any code change.
- The clean third line still emits `روزگار` as a one-word clause because Stanza
  marks it root and attaches `آورد` as `advcl`. That is a Tier 1 package-model
  error; the application task is only to support spaced poetry delimiters while
  preserving spans into the original text.
