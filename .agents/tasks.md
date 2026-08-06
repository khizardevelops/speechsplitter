# LangChunk App — Tasks

## Active

### 0. Nothing installs the local service

The app explains how to start the service; nothing downloads it. The owner's
product description implied it would be fetched. Options unexplored: npx
one-liner, packaged binary, installer. This is the biggest owner-facing gap.

### 1. Pack hosting

`dist-packs/` only exists on machines that ran the engine's `packs:build`.
Point `LANGCHUNK_REGISTRY` at a public static host (GitHub Releases was the
owner's accepted choice when this was last discussed) and bake the URL into
the deployed frontend.

### 2. A correction-loop CLI surface

`POST`/`GET /api/corrections` plus `@langchunk/corrections` are the loop; a
`langchunk corrections` command would need the storage path convention in two
places — do it by moving the storage into a shared package, not by copying
twelve lines.

## Completed

- [x] **Repo created from the split** (2026-08-06) — imports rewritten to the
      published `langchunk` package, own workspace/CI/deploy, mirror suite
      relocated to `tests/` and re-pointed at the installed package.

## Explicitly deferred

- In-browser engine (WASM) — parked engine-side until a browser-runnable model
  measures better than Stanza. The frontend's engine seam (`client.ts` as the
  single call site) is kept open on purpose.
