<!--
⚠️ AI INSTRUCTION — READ THIS FIRST — MANDATORY

You are reading a file from the .agents/ project brain. This folder exists to give
you persistent memory across sessions. You MUST treat it as a living document.

REQUIRED ACTIONS — non-negotiable:
1. READ all files in .agents/ at the start of every session before writing any code.
2. CRITICAL: When updating files, DO NOT remove this header section. This section is crucial for consistent usage and updation of the .agents folder
3. UPDATE all relevant files at the END of every session — especially:
   - state.md        → reflect current implementation status
   - last-session.md → write a full AI-to-AI handoff summary
   - tasks.md        → tick completed tasks, add newly discovered ones
4. DO NOT skip updates even if the session was short or "minor."
5. The next AI reading this has NO memory of your session. Write for them.
6. BE HONEST: If a feature is buggy or half-finished, document it in state.md. Do not hallucinate progress

FAILURE TO UPDATE = broken handoff = wasted developer time.
-->




.agents/
│
├─ PURPOSE:
│  This folder is the LLM-facing “project brain”.
│  Everything here exists so a human OR a different LLM can
│  instantly understand the project, its current state,
│  its constraints, and how to continue without re-deriving intent.
│
├─ README.md
│  ─ What this folder is
│  ─ How to use it
│  ─ Which files are authoritative
│  ─ Instructions like:
│    “Read all files in this folder before making changes.”
│
├─ context.md
│  ─ Why this project exists
│  ─ What problem it’s solving
│  ─ Non-goals (explicitly what NOT to build)
│  ─ High-level intent and philosophy
│  ─ The “vibe” (experimental, production, research, etc.)
│
├─ state.md
│  ─ THE MOST IMPORTANT FILE
│  ─ Describes how the project works RIGHT NOW
│  ─ Present tense only
│  ─ System overview, pipeline, components, runtime behavior
│  ─ What is implemented vs missing
│  ─ Invariants the system relies on
│
├─ pipeline.md
│  ─ Step-by-step data/control flow
│  ─ Inputs → transformations → outputs
│  ─ Async jobs, background workers, queues
│  ─ Where side effects happen
│  ─ Especially useful for non-trivial systems
│
├─ decisions.md
│  ─ Frozen decisions and tradeoffs
│  ─ Why X was chosen over Y
│  ─ Prevents LLMs from reopening settled debates
│  ─ ADR-lite, but written casually
│
├─ constraints.md
│  ─ Hard rules the LLM must not violate
│  ─ Tech stack constraints
│  ─ Performance, security, licensing, platform limits
│  ─ “Never do X” rules
│
├─ assumptions.md
│  ─ Things currently assumed to be true
│  ─ External services behaving correctly
│  ─ Data shape assumptions
│  ─ Often becomes bugs later — good to track explicitly
│
├─ known-issues.md
│  ─ Known bugs
│  ─ Technical debt
│  ─ Fragile areas
│  ─ Workarounds currently in place
│
├─ roadmap.md
│  ─ Near-future direction (not a wish list)
│  ─ What is planned next
│  ─ What is explicitly postponed
│  ─ Helps LLM avoid implementing “future ideas” prematurely
│
├─ last-session.md
│  ─ LLM save-state
│  ─ What was just done
│  ─ What was attempted but failed
│  ─ Exact next steps to continue
│  ─ This is gold for LLM handoff
│
├─ tasks.md
│  ─ Current actionable tasks
│  ─ Ordered, scoped, concrete
│  ─ NOT a backlog dump
│
├─ prompts.md
│  ─ Reusable prompt fragments
│  ─ Style rules
│  ─ Review checklists
│  ─ “When editing X, always consider Y”
│
├─ style.md
│  ─ Code style preferences
│  ─ File organization rules
│  ─ Naming conventions
│  ─ What “clean” means in this project
│
├─ glossary.md
│  ─ Project-specific terms
│  ─ Domain language
│  ─ Prevents LLM misunderstandings
│
├─ skills.md
│  ─ Developer skill profile (optional)
│  ─ Preferred languages, paradigms, tooling
│  ─ What to avoid explaining vs what needs explanation
│
└─ archive/
   ─ Old context files
   ─ Deprecated decisions
   ─ Superseded plans
   ─ Keeps main files clean without losing history
