---
name: aisdlc-dev-investigate
description: Read-only investigation workflow for a ticket - understand the symptom, gather evidence, analyze, test hypotheses, produce findings. Never modifies source. Use when the user wants a read-only aisdlc investigation in a dev workspace.
---

# aisdlc investigate workflow (Kiro)

Produce evidence-based findings without changing code. See `aisdlc-lifecycle-reference` for conventions and the `AI_SDLC_PLUGIN_HOME` setup. Let `DEV=%AI_SDLC_PLUGIN_HOME%\plugins\aisdlc-dev` and `STATE=node %DEV%\scripts\state\aisdlc-state.js`.

The ticket must match `^[A-Z][A-Z0-9]*-\d+$`. Run inside a dev workspace.

## Note on enforcement in Kiro
Investigation tasks are read-only by design. There is no hook to block source edits here, so hold to the read-only rule by discipline: no checkout, stash, branch, or any command that modifies a working tree or a system.

## Procedure
1. Retrieve the ticket (jira-ticket phase 1; ask if Jira is unavailable, never guess). `%STATE% init <TICKET> investigation`; jira-ticket phase 2; `%STATE% transition <TICKET> TICKET_READY`.
2. `%STATE% transition <TICKET> UNDER_INVESTIGATION`. Record candidate repositories: `%STATE% set <TICKET> repositories "[\"...\"]"` (informational only).
3. Understand the symptom; gather evidence; analyze; test hypotheses. Read-only means only: reading files, `git -C <path> grep`, `git -C <path> show main:<file>`, `git log`. Running existing tests/queries is allowed only if read-only and non-production.
4. Write `tasks/<TICKET>/findings.md`: symptom, evidence (commit SHA and file/line references), hypotheses tested and outcome, conclusions with confidence, open questions, recommended next task type. No secrets.
5. An investigation never modifies source. If the developer wants a fix, they start a new `aisdlc-dev-bug` or `aisdlc-dev-feature` task with its own ticket; this task stays read-only.
6. When findings are complete, the developer finishes the task (it becomes COMPLETED).

## Outputs
`tasks/<TICKET>/jira.md`, `tasks/<TICKET>/findings.md`.

## Failure behavior
Missing facts: ask. Conflicting evidence: record both and ask; do not guess. Use failure states with a reason via the CLI when blocked.

## Safety restrictions
Read-only. No production access. Never edit `task.yaml` directly.
