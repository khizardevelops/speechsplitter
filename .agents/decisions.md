# speechsplitter — Decisions

Engine-side decisions (the two-tier design, why Stanza, why packs are data,
the accuracy doctrine) live in the engine repo:
`../langchunk/.agents/decisions.md`. They are not duplicated here — read them
there before reopening anything that smells settled. Entries below are the
ones that bind *this* repo directly.

## A0. Product identity is speechsplitter; engine identity is langchunk

2026-08-08, owner: `langchunk` remains the name of the MIT npm package.
This repository is the AGPL-3.0-only **speechsplitter** application, including
its web app, local service, CLI, and TUI. Public application labels and the
application CLI use `speechsplitter`; TypeScript imports and dependency
references remain `langchunk` because they name the separate engine package.

## A1. This repo exists because the engine became an npm package

2026-08-06, owner: *"the langchunk package … needs to be its own project …
published, and then that npm package needs to be used in my langchunk-app"*,
then *"move the app into ./langchunk-app and let the root (langchunk) folder
be for the npm package. go."* Engine repo §V4-71 records the full split. The
app consumes `langchunk` from npm with subpath imports; `@langchunk/packs`
and `@langchunk/corrections` stay local workspace packages (private,
never published — the scoped names are historical, not a promise).

Consequences: Tier 2 engine bugs are fixed in the engine repo and arrive by
version bump; the mirror suite compares the frontend against the *installed*
package, so it also guards against an engine release changing exporter
behaviour under the app.

## A6. Production Tier 1 is app-owned; evaluation comes first

2026-08-08: LangChunk now accepts portable Tier 1 output and never executes a
model. SpeechSplitter owns `backend/packages/tier1-*` and the raw-text pipeline
that invokes them. `speechsplitter-eval` owns candidate counterparts, heavy
model/corpus state, and Gates 2/3. Promotion is an explicit copy after a
recorded evaluation; the app must not depend on evaluator source at runtime.

## A2. The frontend is one Konsta design system, two layouts (engine §V4-64–67)

Rebuilt three times 2026-08-05 under owner review; two distinct-desktop-skin
attempts were rejected (*"uses no konsta ui component"*, *"absolutely broken …
disgusting"*). What stands: every visible piece is a Konsta component in
`lib/components/`, rendered verbatim by both shells; a layout arranges, never
re-skins. The layout picker is exposed in Settings (Automatic/Desktop/Mobile)
after the owner reversed its removal — the responsive default is unchanged.
The Konsta component traps that shaped the markup are in `known-issues.md`.

## A3. The frontend stays outside the pnpm workspace

Installed with bun; three files are hand-copies checked by `tests/`
(behaviour-compared, not text-compared). Joining the installs to share a
handful of declarations would couple the web app to the whole workspace. The
copies are permitted; drift is not.

## A4. Deployment is a static page talking to a local service

GitHub Pages serves `frontend/build` (BASE_PATH derived from the repo name, so
a fork deploys unmodified). Analysis happens in the visitor's local service —
localhost is exempt from mixed-content blocking. No cloud inference. The
in-browser engine idea is explored and recorded engine-side; it lost on
accuracy and stays parked until a browser-runnable model measures better.

## A5. Two top-level trees: frontend/ and backend/

2026-08-06, owner: *"make the structure of the langchunk-app different so that
it makes more sense, separation of concerns, and insulation and modularity.
like a frontend / backend folder approach."* The pnpm workspace moved whole
into `backend/` — package.json, lockfile, tsconfigs, vitest config, tests,
`.venv-stanza`, `language-packs/` — leaving the repo root as an umbrella
(README, LICENSE, `.github/`, `.agents/`). Each tree installs independently
with its own package manager; neither imports from the other; the seams are
HTTP on :8787 and the three mirror-checked copies. All pnpm commands run from
`backend/`. CI's backend job sets `working-directory: backend` (and
pnpm/action-setup needs `package_json_file`, setup-node needs
`cache-dependency-path`, both pointing there).
