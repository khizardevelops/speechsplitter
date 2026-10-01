# speechsplitter — Commands

Two self-contained trees: `backend/` is pnpm, `frontend/` is bun. Node 22.
**All pnpm commands run from `backend/`** — the repo root holds no workspace.

## Everyday

```bash
cd backend
pnpm install
pnpm run verify            # typecheck + workspace tests (incl. mirror suite)
pnpm run build             # tsc -b across the workspace
pnpm run speechsplitter --help  # application CLI; langchunk remains the engine
```

The mirror suite's CSV/JSONL checks skip unless the frontend tree is synced —
run `bun install` in `frontend/` once and they run for real.

## Running it on text

Needs the app-owned Python bridge once (for the production Stanza runtime):

```bash
cd backend
pnpm run setup:stanza                       # install bridge dependencies; no model download
pnpm run model:download -- --language en,ru # provision selected local Stanza models
```

The setup command keeps `--system-site-packages` (so pip does not re-download
PyTorch) and installs Stanza plus Python `transformers<5`, required by the
production Russian transformer-backed parser. Parsing is network-free: its
Stanza resources and transformer backbones stay under ignored `backend/models/`.

```bash
cd backend
pnpm run build
pnpm run speechsplitter doctor                             # check the bridge
pnpm run speechsplitter parse --lang en --format outline f.txt
pnpm run speechsplitter languages                          # incl. plugin packs
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

## Model-pack catalogue

`backend/dist-packs/` is this application's generated runtime catalogue. It is
not npm-package content and is intentionally gitignored. After a candidate
model passes evaluation, build a production catalogue from the evaluator:

The local server reads this directory by default; use `LANGCHUNK_REGISTRY` only
to point at a hosted registry or another explicit source.

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

Tier 2 package development happens in `../langchunk` — publish there, bump
here. Tier 1 experiments and quality gates happen outside this standalone
application; promote only selected runtime changes here.
