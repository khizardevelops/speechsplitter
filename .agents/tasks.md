# speechsplitter — Tasks

## Active

### 0. Support spaced poetry delimiters without changing the source text

The app segments physical line breaks correctly but treats `line / line` as one
sentence. Add an explicitly tested, span-preserving boundary rule for a spaced
slash, while keeping malformed joins such as `گوهرندچو` the user's input error.
Do not hide the independent Stanza parse error that makes `روزگار` a clause in
`چو عضوی به درد آورد روزگار`; that belongs in the engine's Tier 1 accuracy work.

### 1. Nothing installs the local service

The app explains how to start the service; nothing downloads it. The owner's
product description implied it would be fetched. Options unexplored: npx
one-liner, packaged binary, installer. This is the biggest owner-facing gap.

### 2. Pack hosting

`dist-packs/` only exists on machines that ran the engine's `packs:build`.
Point `LANGCHUNK_REGISTRY` at a public static host (GitHub Releases was the
owner's accepted choice when this was last discussed) and bake the URL into
the deployed frontend.

### 3. A correction-loop CLI surface

`POST`/`GET /api/corrections` plus `@langchunk/corrections` are the loop; a
`langchunk corrections` command would need the storage path convention in two
places — do it by moving the storage into a shared package, not by copying
twelve lines.

## Completed

- [x] **Product identity prepared** (2026-08-08) — the local repository,
      frontend, service, CLI, TUI, links, metadata, and Pages documentation
      use `speechsplitter`; AGPL-3.0-only licensing remains unchanged.

- [x] **Application-owned model-pack catalogue** (2026-08-06) — moved the
      generated registry and ONNX payload from the engine workspace to
      `backend/dist-packs/`. The server's default path now works; the engine
      pack builder requires an explicit application output path on refresh.
- [x] **Repo created from the split** (2026-08-06) — imports rewritten to the
      published `langchunk` package, own workspace/CI/deploy, mirror suite
      relocated to `tests/` and re-pointed at the installed package.

## Explicitly deferred

- In-browser engine (WASM) — parked engine-side until a browser-runnable model
  measures better than Stanza. The frontend's engine seam (`client.ts` as the
  single call site) is kept open on purpose.
