# LangChunk App — Commands

Two self-contained trees: `backend/` is pnpm, `frontend/` is bun. Node 22.
**All pnpm commands run from `backend/`** — the repo root holds no workspace.

## Everyday

```bash
cd backend
pnpm install
pnpm run verify            # typecheck + workspace tests (incl. mirror suite)
pnpm run build             # tsc -b across the workspace
```

The mirror suite's CSV/JSONL checks skip unless the frontend tree is synced —
run `bun install` in `frontend/` once and they run for real.

## Running it on text

Needs the Python bridge once (for the Stanza analyzer):

```bash
python3 -m venv --system-site-packages .venv-stanza
.venv-stanza/bin/pip install stanza
```

`--system-site-packages` matters — without it pip re-downloads PyTorch and the
venv is ~3 GB instead of 67 MB.

```bash
cd backend
pnpm run build
pnpm run langchunk doctor                                  # check the bridge
pnpm run langchunk parse --lang en --format outline f.txt
pnpm run langchunk languages                               # incl. plugin packs
pnpm run tui                                               # interactive session
```

Formats: `text`, `outline`, `json`, `conllu`, `csv`, `jsonl`, `anki`,
`anki-clauses`, `anki-sentences`. The TUI holds the parser open between
inputs: the first takes ~5 s, the rest ~100 ms. Prefer it for exploring.

## The web app

```bash
cd backend && pnpm run server    # the local service on :8787, in another shell
cd frontend
bun install
bun run dev                      # :5173
bun run check                    # svelte-check
bun run test:unit -- --run       # vitest
bun run test:e2e                 # playwright — builds and previews first
bun run lint                     # prettier --check + eslint
```

`test:e2e` stubs the service with `page.route`, so it needs no model and no
running server.

## Language plugin packs

A pack is a JSON file in `backend/language-packs/` (gitignored runtime state;
the versioned samples live in the engine repo under `samples/language-packs/`).
`LANGCHUNK_LANG_PACKS=/some/dir` points elsewhere.

## The correction loop

```bash
cd backend && pnpm run server
curl -s localhost:8787/api/corrections | jq .summary
```

Reports are append-only JSONL at `~/.langchunk/corrections.jsonl`
(`LANGCHUNK_CORRECTIONS` overrides). `GET` returns each with a fixture
skeleton whose expected output is deliberately blank.

## Upgrading the engine

```bash
cd backend
pnpm update langchunk --latest   # or edit the range in each package.json
pnpm run verify
```

Engine development (gates, accuracy, packs data) happens in
`../langchunk` — publish there, bump here.
