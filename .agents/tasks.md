# speechsplitter — Tasks

## Active

1. Support spaced poetry delimiters without rewriting source text.
2. Provide a supported installer/distribution path for the local service.
3. Host or publish the generated `backend/dist-packs/` registry.

## Runtime promotion

- Evaluate Tier 1 changes in `../speechsplitter-eval` against the current built
  LangChunk package. Copy only selected runtime/configuration changes into this
  backend, then run `pnpm run verify` before release.

## Done

- [x] Moved production Tier 1 ownership and raw-text orchestration into the
      application backend (2026-08-08).
- [x] Made the production Stanza setup install required Python Transformers and
      verified the Russian transformer-backed bridge (2026-08-08).
