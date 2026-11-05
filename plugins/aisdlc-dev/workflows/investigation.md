# Investigation Workflow

Reference for `/aisdlc-dev:investigate` (spec §36). Procedure: `skills/investigate/SKILL.md`. Uses the `investigation` lifecycle in `${CLAUDE_PLUGIN_ROOT}/config/task-types.yaml`.

## States

CREATED, TICKET_READY, UNDER_INVESTIGATION, COMPLETED. Failure states as in `workflows/feature.md`.

## Flow

Ticket -> understand symptom -> gather evidence -> analyze system -> test hypotheses -> produce findings.

## Rules

- Read-only by default: the lifecycle has no source-edit states, so the hook blocks all source edits for investigation tasks.
- No checkout, stash, branch, or other working-tree changes in repositories; use read-only git (`git show`, `git grep`, `git log`).
- Findings are recorded in `tasks/<ticket>/findings.md` with evidence (commit SHA, paths) and confidence.
- An investigation MUST NOT modify source unless explicitly converted into an implementation task; conversion means starting a separate task (bug, feature, ...), not changing this one.
- No production access; no secrets in artifacts.
