---
name: approve
description: Record a human approval for the specification or plan gate of a task. Use only when the developer explicitly runs /aisdlc:approve.
argument-hint: <ticket-number> <gate>
disable-model-invocation: true
---

# approve

## Purpose
Convenience command to grant an approval gate (spec §24, §51). Gates supported by the state engine: `specification`, `plan`.

## Invocation conditions
Only when the developer types `/aisdlc:approve <ticket-number> <gate>`. Never run on the model's own initiative. `$ARGUMENTS` = `<ticket-number> <gate>`.

## Inputs
Ticket number, gate (`specification` | `plan`).

## Prerequisites
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` succeeds.
- specification gate: `tasks/<TICKET>/specification.md` exists; state is AWAITING_SPEC_APPROVAL, SPEC_REVIEW_REQUIRED, or WAITING_FOR_APPROVAL with `resume_state` AWAITING_SPEC_APPROVAL (or SPEC_APPROVED when reapproving a changed specification).
- plan gate: `tasks/<TICKET>/implementation-plan.md` exists; state is AWAITING_PLAN_APPROVAL (or WAITING_FOR_APPROVAL with that `resume_state`).

## Procedure
1. Validate arguments; if the gate is anything else, stop (the state engine only supports specification and plan).
2. Show what is being approved: ticket title, artifact path, and for the specification the current version and that its hash will be recorded.
3. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js approve <TICKET> <gate>`. This records approver, timestamp, and (specification) the hash and incremented version when the content changed.
4. Specification gate: if the state is AWAITING_SPEC_APPROVAL, run `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> SPEC_APPROVED`. Plan gate: no transition here.
5. Tell the developer the next step: `/aisdlc:resume <TICKET>` (or the running workflow continues).

## Outputs
`approvals.<gate>` updated by the CLI; audit event `approval-granted`.

## Failure behavior
CLI `BLOCKED` output is shown verbatim; do not work around it.

## Safety restrictions
Approval is a human decision: never approve on the user's behalf from inferred intent. Never edit `task.yaml` directly.
