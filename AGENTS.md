# Agent Instructions

This project uses `.agents/handoff/` as its agent memory and handoff folder.

IMPORTANT: Do not edit this AGENTS.md file for project memory, state, tasks, decisions, or handoff notes. This file is only a pointer. Put all project memory updates in `.agents/handoff/`.

Before making changes:
1. Read `.agents/handoff/README.md`.
2. Read every active standard file in `.agents/handoff/memory/`,
   `.agents/handoff/rules/`, and `.agents/handoff/references/`.
   Do not recursively read `.agents/handoff/archive/`; open a specific
   snapshot only when the task needs historical context.
3. Treat `.agents/handoff/memory/state.md`, `.agents/handoff/memory/tasks.md`, and `.agents/handoff/memory/last-session.md` as the primary session state.
4. Keep the relevant files in `.agents/handoff/` updated before ending the session.

`.agents/` is a shared folder. `.agents/skills/` holds skills installed with `npx skills`: on-demand instructions, not session state. Anything else beside `handoff/` belongs to the user or to other tools. Read it when a task calls for it, but never treat it as session state and never write session state into it.

Do not skip the `.agents/handoff/` files. Do not write session state into AGENTS.md. The `.agents/handoff/` folder is the source of truth for agent context in this project.
