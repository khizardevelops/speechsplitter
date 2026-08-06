# LangChunk App — Decisions

Engine-side decisions (the two-tier design, why Stanza, why packs are data,
the accuracy doctrine) live in the engine repo:
`../langchunk/.agents/decisions.md`. They are not duplicated here — read them
there before reopening anything that smells settled. Entries below are the
ones that bind *this* repo directly.

## A1. This repo exists because the engine became an npm package

2026-08-06, owner: *"the langchunk package … needs to be its own project …
published, and then that npm package needs to be used in my langchunk-app"*,
then *"move the app into ./langchunk-app and let the root (langchunk) folder
be for the npm package. go."* Engine repo §V4-71 records the full split. The
app consumes `langchunk` from npm with subpath imports; `@langchunk/packs`
and `@langchunk/corrections` stay local workspace packages (private,
never published — the scoped names are historical, not a promise).

Consequences: engine bugs are fixed in the engine repo and arrive by version
bump; the apps that use the ONNX analyzer declare `onnxruntime-node` and
`@huggingface/transformers` themselves because the engine lists them as
optional peers; the mirror suite compares the frontend against the *installed*
package, so it also guards against an engine release changing exporter
behaviour under the app.

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
