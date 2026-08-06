# LangChunk App — Known Issues

## Nothing installs the local service

**Severity**: Medium — a product gap, and the owner's description implied
otherwise. The web app detects that the service is absent and explains how to
start it, but nothing downloads or installs it. The owner described the app as
something that *"must download its local node server and its models"*; the
models half is built, the server half is not. A packaging question — a single
binary, an installer, an npx one-liner — and it is open.

## Pack hosting does not exist

**Severity**: Low — by design, and one environment variable away.
`dist-packs/` (built by the engine repo's `pnpm run packs:build`) is served
from a local path. `LANGCHUNK_REGISTRY` points the server at any static host
and nothing else changes.

## The frontend mirrors the schema by hand — checked

`frontend/src/lib/langchunk/{csv,jsonl,types}.ts` are hand-copies, because the
frontend is installed with bun outside the pnpm workspace, and that stays.
`tests/frontend-mirror.test.ts` compares the exporters by behaviour and the
schema by field names against the installed `langchunk` package. A schema
change still must be applied twice; the build now notices when it was not.

## Konsta 5.3.0 traps — read before touching the frontend

**Severity**: Low individually, but each one costs an hour to rediscover.

- **`Dialog` throws on a string `title`** — it calls `printText` without
  importing it, the only component in the set that does. Pass `title` as a
  snippet; both dialogs in both shells do, with a comment.
- **`Button` hard-codes `role="button"` after its prop spread**, so a `role`
  passed in is silently dropped. A segmented control therefore cannot be a
  radio group; ours is `role="group"` + `aria-pressed` on each
  `SegmentedButton`. Tests query `getByRole('button', …)`, not `radio`.
- **`BlockTitle` pulls itself onto the next block** with
  `has-[+.k-block]:-mb-6`, arithmetic that only works against a `Block`'s
  default `my-8`. Inside a popover the heading lands on top of the control.
  Use one `Block` with plain labels there.
- **`Navbar` wraps its whole `right` snippet in one `<Glass>`** — one control
  only. And anything wrapped around that control must keep its height: the
  icon `Link` is `h-full aspect-square`, so a plain `<span>` around it (a
  Popover anchor) collapses and the 44-pixel capsule becomes a vertical pill.
  `class="flex h-full"` on the wrapper; `display: contents` is not the fix —
  it removes the box the Popover measures.
- **`MenuListItem`'s types omit `linkComponent`**, so the row renders as an
  `<a>` with no href, unreachable by keyboard. Use
  `ListItem menuListItem linkComponent="button"` if a source list is wanted.
- **`@tailwindcss/forms` fights Konsta** and was removed from `layout.css`.
  Do not add it back.
- **A `backdrop-filter` creates a stacking context**: a popover inside a
  blurred toolbar cannot be lifted above a sibling scrim by its own
  `z-index` — the scrim has to go *below* the toolbar. This silently ate
  every click in the settings panel once.

## Screenshots, not tests, judge the interface

The suite passed at every stage of two owner-rejected designs — it checks
behaviour and text, not whether the result is ugly. Playwright with
`deviceScaleFactor: 2` at 1440×900 and 402×874, stubbing `/api/languages` and
`/api/analyze` with `page.route`, is how rounds were actually judged.
