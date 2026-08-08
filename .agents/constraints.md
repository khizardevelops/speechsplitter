# speechsplitter — Constraints

Hard rules. Violating one of these breaks the architecture, not just a test.

## The frontend

- **The frontend must not import from the pnpm workspace.** It is installed
  with bun and mirrors the schema types by hand. Joining the two package
  managers to share type declarations would couple the web app's install to
  the workspace. The mirror suite in `tests/` is the safety net; keep it
  passing, never delete it to make a change easier.
- **One design system: Konsta's iOS theme.** Build the interface out of Konsta
  components; hand-rolled markup is for the things Konsta has no component for
  (a disclosure header, the clause-depth rule) and each says so in a comment.
  **A layout may arrange components; it may never re-skin them** — no
  per-layout font sizes, surface colours, or `[data-shell=...]` CSS. Two
  attempts at a distinct desktop look were rejected by the owner (engine repo
  §V4-64).
- **Layout defaults to responsive, with an exposed pin.** Automatic follows
  the window and re-decides on resize; Settings offers Automatic/Desktop/
  Mobile in both shells (engine repo §V4-65 as amended).

## Packs and analysis

- **A downloaded pack must be verified before it is used.** SHA-256 while
  streaming, staged, then moved into place.
- **A pack's advertised accuracy must come from a measurement**, not a
  literal. The server chooses runtimes on that number.
- **A correction can never become evidence.** Fixture skeletons ship with the
  expected output blank and marked `unreviewed`.
- **Parsing runs locally and offline. No cloud inference, ever.**

## The engine boundary

- **The engine is the `langchunk` npm package.** Do not vendor engine code
  into this repo, and do not patch engine behaviour here — fix it in the
  engine repo, publish, and bump the dependency. Engine-side rules (Tier 2
  language-generality, packs are data not parsers, spans index the original
  text) are enforced *there*; this repo inherits them by depending on a
  published version.
- Apps that use the ONNX analyzer must declare `onnxruntime-node` and
  `@huggingface/transformers` themselves — the engine deliberately lists them
  as optional peers.

## Runtime

- TypeScript strict; `tsconfig.base.json` is the single source — do not
  weaken `strict`, `noUncheckedIndexedAccess`, or
  `exactOptionalPropertyTypes` in a package-level tsconfig.
- pnpm for the workspace (settings in `pnpm-workspace.yaml`, not `.npmrc`),
  bun for `frontend/`. The two never meet.
- LangChunk is not a translator, dictionary, grammar corrector, chatbot, or
  summariser. Resist these even when easy.

## Project memory

- Read every `.agents/` file before making changes; engine-side decisions live
  in the engine repo's `.agents/` and are not duplicated here.
- Update `state.md`, `tasks.md`, and `last-session.md` at the end of every
  session. Do not put session state in `AGENTS.md`.
