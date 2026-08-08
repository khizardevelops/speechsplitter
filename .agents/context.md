# speechsplitter — Context

This repository is the **application** half of LangChunk. The analysis engine —
UD parse → sentences/clauses/phrases/words, the language packs, the gates, the
measured accuracy — is the **`langchunk` npm package**, developed at
github.com/khizardevelops/langchunk. Everything here consumes it.

What lives here and why:

- `frontend/` — the web app. SvelteKit 5 + Konsta UI (iOS theme), installed
  with bun, deployed as a static site to GitHub Pages. Local-first: the page
  talks to the visitor's local service on :8787 (localhost is exempt from
  mixed-content blocking).
- `backend/` — everything Node, one self-contained pnpm workspace:
  - `apps/server` — the local analysis service: pack registry, verified
    on-demand installs, analysis endpoints, the correction inbox.
  - `apps/cli`, `apps/tui` — terminal surfaces over the same engine.
  - `packages/packs` — language-pack manifests and runtime selection. Data only.
  - `packages/corrections` — the §11.6 human correction loop.
  - `tests/` — the mirror suite guarding the frontend's three hand-copied files.

Non-goals: no cloud inference, ever — parsing runs locally and offline. Not a
translator, dictionary, grammar corrector, chatbot, or summariser.

The split happened 2026-08-06 at the owner's direction (engine repo decision
§V4-71). Engine-side reasoning — why Stanza, why two tiers, why packs are
data — lives in the engine repo's `.agents/decisions.md`; read it there, do
not re-derive it here.
