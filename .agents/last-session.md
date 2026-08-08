# Last Session Handoff

## 2026-08-08 — Production Tier 1 ownership

- Added private backend packages for production Stanza, ONNX, and agreement
  runtimes; moved raw-text orchestration into `@speechsplitter/pipeline`.
- Updated CLI, TUI, and server to use app-owned runtimes rather than removed
  LangChunk analyzer subpaths.
- Kept the `langchunk` npm package as the standalone Tier 2 dependency.
- `cd backend && pnpm run verify` passed: typecheck plus 81 tests.

## Follow-up — repaired Stanza bridge setup

- The app's Russian model failed because `.venv-stanza` had Stanza but no
  Python `transformers`. Added `packages/tier1-stanza/python/requirements.txt`
  and `pnpm run setup:stanza` (uses `python -m pip`, safe after the directory
  rename) to install `transformers<5`.
- The bridge no longer attempts a model download for an `ImportError`; it gives
  the setup command instead. The equivalent evaluator candidate setup changed
  in lockstep.
- Verified imports and a direct ruBERT Russian parse that emitted valid CoNLL-U.

## Next

Continue Tier 1 experiments in `../speechsplitter-eval`, then copy selected
runtime changes here deliberately. Do not reintroduce model execution into
LangChunk.
