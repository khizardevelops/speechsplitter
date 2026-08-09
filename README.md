# speechsplitter

Paste text and explore its grammar as **sentences, clauses, phrases, and
words**. `speechsplitter` is a standalone, local-first application with a web
interface, local analysis service, CLI, and TUI.

**Try it:** <https://khizardevelops.github.io/speechsplitter/>

The browser interface is static. Analysis runs on your own machine through a
local service, so text does not need to be sent to a remote API.

## What it does

- Splits text into source-linked sentences, clauses, phrases, and words.
- Supports multilingual parsing with on-demand language resources.
- Shows parser provenance and confidence instead of hiding uncertainty.
- Exports results as outline text, CSV, JSONL, CoNLL-U, or Anki content.
- Provides the same local analysis through the web app, CLI, and TUI.

The backend owns the complete production pipeline: raw text is segmented,
analyzed by a Tier 1 parser, then passed to the standalone
[`langchunk`](https://github.com/khizardevelops/langchunk) package for grammar
extraction.

## Get started

Requirements: Node 20+, pnpm for the backend, and Bun for the frontend.

```bash
git clone https://github.com/khizardevelops/speechsplitter.git # get the standalone app
cd speechsplitter/backend                                    # enter the local service
pnpm install                                                  # install backend dependencies
pnpm run build                                                # compile the service and CLI
pnpm run server                                               # start analysis on port 8787
```

The local service is available at <http://localhost:8787>.
Before parsing a language served by Stanza, complete the local bridge and model
provisioning step below; starting the service itself does not download models.

In another terminal, start the web application:

```bash
cd speechsplitter/frontend # enter the web application
bun install                # install frontend dependencies
bun run dev                # start the local development server
```

Open the URL Bun prints, normally <http://localhost:5173>.

## CLI and TUI

For the Stanza-powered parser, initialize the local Python bridge and download
only the language models you plan to use:

```bash
cd backend                                  # run from the backend directory
pnpm run setup:stanza                       # install Python dependencies; no model download
pnpm run model:download -- --language en,ru # store English and Russian models locally
```

Parsing never downloads models automatically. Model assets remain local under
`backend/models/` and are ignored by Git.

Then use either local interface:

```bash
pnpm run tui                                                  # interactive terminal interface
pnpm run speechsplitter parse --lang en --format outline file.txt # parse a file from the CLI
```

## Project layout

```text
frontend/        Svelte web application, managed with Bun
backend/
  apps/          deployable entry points: server, CLI, and TUI
  packages/      shared production pipeline, parsers, packs, and corrections
  tests/         backend and frontend-contract coverage
```

The frontend and backend are intentionally separate runtimes. They communicate
only over the local HTTP API.

## Development

```bash
cd backend        # verify the service, CLI, and backend packages
pnpm run verify

cd ../frontend    # verify the web application
bun run check     # Svelte and TypeScript checks
bun run test:unit -- --run # frontend unit tests
bun run test:e2e  # browser end-to-end tests
```

## License

[AGPL-3.0](LICENSE)
