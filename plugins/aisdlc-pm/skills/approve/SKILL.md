---
name: approve
description: Record a human approval for the acceptance_criteria gate of a PM task. Use only when the PM explicitly runs /aisdlc-pm:approve.
argument-hint: <ticket-number> acceptance_criteria
disable-model-invocation: true
---

# approve

## Purpose
Convenience command to grant the PM lifecycle's single approval gate, `acceptance_criteria`. The state engine refuses the hand-off transition until this gate is approved and `acceptance-criteria.md` is unchanged since approval.

## Invocation conditions
Only when the PM types `/aisdlc-pm:approve <ticket-number> acceptance_criteria`. Never run on the model's own initiative. `$ARGUMENTS` = `<ticket-number> acceptance_criteria`.

## Inputs
Ticket number, gate (`acceptance_criteria`).

## Prerequisites
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` succeeds.
- `tasks/<TICKET>/acceptance-criteria.md` exists; state is `ACCEPTANCE_CRITERIA_DEFINED`.

## Procedure
1. Validate arguments; if the gate is anything other than `acceptance_criteria`, stop (the PM lifecycle only has that gate).
2. Show what is being approved: ticket, artifact path `tasks/<TICKET>/acceptance-criteria.md`, and that its hash will be recorded so later edits force reapproval.
3. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js approve <TICKET> acceptance_criteria`. This records approver, timestamp and the artifact hash.
4. Tell the PM the next step: `/aisdlc-pm:handoff <TICKET> dev|design`.

## Outputs
`approvals.acceptance_criteria` updated by the CLI; audit event `approval-granted`.

## Failure behavior
CLI `BLOCKED` output is shown verbatim; do not work around it.

## Safety restrictions
Approval is a human decision: never approve on the PM's behalf from inferred intent. Never edit `task.yaml` directly.
