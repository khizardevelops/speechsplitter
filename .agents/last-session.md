# Last Session Handoff

## Date

2026-08-06 — this repo's first session: created by splitting the original
monorepo. The engine stayed at `../langchunk` (npm package `langchunk`,
published 0.1.0); everything application moved here.

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
