# speechsplitter

Paste text, get its grammar back: **sentences → clauses → phrases → words**,
each unit traceable to the exact characters it came from. This repository is
the **speechsplitter** application — a local-first web app, a local analysis
service, a CLI and a TUI. [`langchunk`](https://github.com/khizardevelops/langchunk)
is the standalone Tier 2 grammar package; this application owns the production
Tier 1 runtimes and raw-text orchestration that feed it.

**Try it:** https://khizardevelops.github.io/speechsplitter/

The deployed page is fully static; analysis runs in a *local* service on your
machine (browsers exempt `localhost` from mixed-content blocking, so the HTTPS
page can reach it). Languages install on demand — nothing about a language
ships in the bundle, and every language's measured accuracy is shown in the
app, honestly.

## Layout

Two self-contained trees — different package managers, different runtimes,
insulated on purpose. Neither imports from the other; the one seam is HTTP.

```
frontend/       the web app — SvelteKit 5 + Konsta UI (iOS theme), bun
backend/        everything Node — pnpm workspace, installed independently
  apps/server     the local service: pack registry, verified installs, analysis
  apps/cli        `speechsplitter parse --format outline|csv|jsonl|anki …`
  apps/tui        interactive terminal session (keeps the parser warm)
  packages/pipeline       raw text → Tier 1 → LangChunk Tier 2 orchestration
  packages/tier1-stanza   promoted production Python/Stanza runtime
  packages/tier1-onnx     promoted production ONNX runtime
  packages/tier1-agreement calibrated confidence from production runtimes
  packages/packs        language-pack manifests + runtime selection, data only
  packages/corrections  the human correction loop
  tests/          the mirror suite: the frontend's three hand-copied files,
                  checked against the published langchunk package by behaviour
  dist-packs/     generated model registry + downloadable payload, served by
                  the local server and intentionally not committed
```

## Running it

```bash
cd backend
pnpm install
pnpm run build
pnpm run server                  # local service on :8787

cd ../frontend
bun install
bun run dev                      # the web app on :5173
```

The CLI and TUI need the Python bridge for the highest-accuracy parser:

```bash
cd backend
pnpm run setup:stanza

pnpm run tui
pnpm run speechsplitter parse --lang en --format outline file.txt
```

## Verifying

```bash
cd backend  && pnpm run verify   # typecheck + tests, incl. the mirror suite
cd frontend && bun run check && bun run test:unit -- --run && bun run test:e2e
```

## License

[AGPL-3.0](LICENSE). Whole-pipeline measurements and candidate-model experiments
live in [speechsplitter-eval](https://github.com/khizardevelops/speechsplitter-eval);
the MIT LangChunk package remains independently usable without this app.
