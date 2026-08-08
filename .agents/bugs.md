# Bugs

This is the active queue for observed or suspected defects that can be fixed within the project's current foundational technology. These problems require investigation, repair, and verification.

> **Agent rule:** Every current bug is unresolved work. Keep it visible and give it a concrete Next action until a fix is verified. Never close or reclassify a bug merely because it is difficult, low priority, or has a workaround.

## File Boundary

- Foundational technology means the core database, auth provider, framework or runtime, infrastructure platform, protocol, or fundamental algorithmic approach on which the project is built.
- Keep a problem here when it can be fixed through code, configuration, schemas, integrations, or supported upgrades without replacing that foundation.
- Difficulty does not determine the file. An extra-hard defect remains a bug if the current foundation can support a correct implementation.
- Move a problem to known-issues.md only when evidence shows that a correct fix requires replacing or re-architecting foundational technology. Carry over the evidence and identify the required foundational change.
- A workaround reduces impact but does not resolve or close a bug.
- After a fix is verified, move the entry to Fixed Bugs. Do not mark a bug fixed based only on a code change.
- When a bug is part of the current work plan, tasks.md may reference its bug ID instead of duplicating its details.

## Current Bugs

Difficulty describes the likely scope and uncertainty of the fix, not its severity or priority. Reclassify a bug when new evidence changes the estimate. Within each section, order bugs by severity and then age.

### Needs Triage

Use this section when a report is not yet reproducible or there is not enough evidence to estimate the fix. Record the smallest next investigation step, then move the bug to a difficulty section once its scope is understood.

### Easy Fix

The cause is understood and localized. The fix should be a small change with focused verification.

### Hard Fix

The bug needs substantial investigation or coordinated changes across multiple parts of the system.

### Extra Hard Fix

The root cause is unclear or the repair needs broad, coordinated work, but a correct fix is still possible within the current foundational technology. Record the smallest useful experiment instead of guessing at a solution.

<!--
Current bug entry:

#### BUG-001 — Short title
- Severity: low | medium | high | critical
- Status: reported | reproduced | investigating | fixing | blocked
- Area:
- Reported: YYYY-MM-DD
- Reproduction:
- Expected:
- Actual:
- Evidence:
- Workaround: none
- Next action:
-->

## Fixed Bugs

Keep a concise, verifiable history here. Add newly fixed bugs first.

<!--
Fixed bug entry:

### BUG-001 — Short title
- Fixed: YYYY-MM-DD
- Cause:
- Resolution:
- Verification:
- Reference: commit, PR, or issue
-->
