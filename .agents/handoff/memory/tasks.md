# speechsplitter — Tasks

## Active

1. Support spaced poetry delimiters without rewriting source text.
2. Provide a supported installer/distribution path for the local service.
3. Host or publish the generated `backend/dist-packs/` registry.

## Runtime promotion

- Evaluate Tier 1 changes in their dedicated evaluation workspace against the
  current built langchunk package. Copy only selected runtime/configuration
  changes into this backend, then run `pnpm run verify` before release.

## Done

- [x] Moved production Tier 1 ownership and raw-text orchestration into the
      application backend (2026-08-08).
- [x] Made the production Stanza setup install required Python Transformers and
      verified the Russian transformer-backed bridge (2026-08-08).
- [x] Rewrote the public README as a standalone application guide and removed
      external evaluator references from application documentation (2026-08-09).
- [x] Documented the backend application/package boundary in the standalone
      README and corrected deployment workflow naming (2026-08-09).
- [x] Made promoted Tier 1 runtime packages parity-compatible with Eval and
      made production Stanza model provisioning explicit and repository-local
      (2026-08-09).
