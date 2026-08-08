# speechsplitter — State

## Current status

SpeechSplitter is the AGPL local-first application. It consumes the published
MIT `langchunk` package for Tier 2 grammar parsing, while its backend owns the
production Tier 1 runtime implementations and raw-text pipeline.

```
raw text -> app segmenter -> app Tier 1 analyzer -> portable analysis
         -> LangChunk Tier 2 -> UI / CLI / TUI / exports
```

`backend/packages/pipeline` owns the app-specific raw-text orchestration.
`backend/packages/tier1-stanza`, `tier1-onnx`, and `tier1-agreement` hold
production copies promoted from the evaluator. The CLI, TUI, and server select
those packages; LangChunk is never asked to run a model.

`pnpm run setup:stanza` creates/repairs the local bridge environment and
installs both Stanza and Python `transformers<5`. The cap is required for the
Russian ruBERT checkpoint; setup uses `python -m pip` so an existing virtualenv
survives a directory rename.

The frontend remains a separate Bun tree; the backend remains a strict pnpm
workspace. Their sole runtime seam is the local HTTP service.

## Verification

After the refactor, `cd backend && pnpm run verify` passed typecheck and 81
tests, including runtime decode, agreement, pipeline, and frontend mirror
coverage. The lockfile records app-owned ONNX runtime dependencies.

## Invariants

- Candidate Tier 1 work, models, and whole-pipeline measurement stay in
  `../speechsplitter-eval`; this app receives explicit promoted copies only.
- LangChunk behavior is consumed from the npm package, never vendored or
  imported from its source checkout.
- Production runtime changes must be evaluated before promotion.
