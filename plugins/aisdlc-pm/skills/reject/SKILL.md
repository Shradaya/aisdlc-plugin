---
name: reject
description: Record a rejection of the acceptance_criteria gate with a reason. Use only when the PM explicitly runs /aisdlc-pm:reject.
argument-hint: <ticket-number> acceptance_criteria <reason>
disable-model-invocation: true
---

# reject

## Purpose
Record a rejected `acceptance_criteria` gate so the ticket stays blocked from hand-off until the acceptance criteria are revised and re-approved.

## Invocation conditions
Only on `/aisdlc-pm:reject <ticket-number> acceptance_criteria <reason>`. `$ARGUMENTS` = `<ticket-number> acceptance_criteria <reason...>`.

## Inputs
Ticket, gate (`acceptance_criteria`), non-empty reason.

## Prerequisites
Task exists (`node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>`). The reason is mandatory; if missing, ask for it.

## Procedure
1. Validate arguments; if the gate is anything other than `acceptance_criteria`, stop.
2. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js reject <TICKET> acceptance_criteria "<reason>"`.
3. Tell the PM to revise with `/aisdlc-pm:refine <TICKET>` (move the task back, update `acceptance-criteria.md`), then re-approve with `/aisdlc-pm:approve <TICKET> acceptance_criteria`.

## Outputs
`approvals.acceptance_criteria` status `rejected` with reason; audit event `approval-rejected`.

## Failure behavior
CLI errors shown verbatim.

## Safety restrictions
Never edit `task.yaml` directly. Rejection is a human decision; never reject on the PM's behalf from inferred intent.
