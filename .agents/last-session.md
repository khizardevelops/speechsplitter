# Last Session Handoff

## 2026-08-08 — Production Tier 1 ownership

- Added private backend packages for production Stanza, ONNX, and agreement
  runtimes; moved raw-text orchestration into `@speechsplitter/pipeline`.
- Updated CLI, TUI, and server to use app-owned runtimes rather than removed
  langchunk analyzer subpaths.
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

Continue Tier 1 experiments in their dedicated evaluation workspace, then copy
selected runtime changes here deliberately. Do not reintroduce model execution
into langchunk.

## 2026-08-09 — evaluator workflow documentation

No application runtime changed. Documentation now consistently uses lowercase
project names; `cd backend && pnpm run verify` still passes all 81 tests.

## 2026-08-09 — standalone application README

Rewrote the public README around getting started, local analysis, CLI/TUI, and
development. Removed the remaining evaluator reference from historical app
documentation so the application repository stands on its own.

All setup, CLI, and development snippets now include inline comments explaining
what each command does.

## 2026-08-09 — organization follow-up

The standalone README now includes the application/module layout: frontend,
backend deployable apps, reusable backend packages, and contract coverage.
No runtime changed; `cd backend && pnpm run verify` passed all 81 tests.

## 2026-08-09 — promotion-compatible Tier 1 runtimes

Stanza, ONNX, and agreement runtime source, runtime tests, and package
contracts now match their candidate counterparts. Stanza no longer downloads
models while parsing: `setup:stanza` installs dependencies, while
`model:download -- --language <code>` stores selected models in ignored
`backend/models/`. The application remains standalone. Backend verification
passed with 83 tests.
