---
name: reject
description: Record a rejection of the specification or plan gate with a reason. Use only when the developer explicitly runs /aisdlc:reject.
argument-hint: <ticket-number> <gate> <reason>
disable-model-invocation: true
---

# reject

## Purpose
Record a rejected approval gate so implementation stays blocked (spec §24, §51).

## Invocation conditions
Only on `/aisdlc:reject <ticket-number> <gate> <reason>`. `$ARGUMENTS` = `<ticket-number> <gate> <reason...>`.

## Inputs
Ticket, gate (`specification` | `plan`), non-empty reason.

## Prerequisites
Task exists (`node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>`). The reason is mandatory; if missing, ask for it.

## Procedure
1. Validate arguments.
2. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js reject <TICKET> <gate> "<reason>"`.
3. Ask the developer (AskUserQuestion) what happens next: `Revise` (keep the task; update the specification or plan to address the reason, then request approval again) or `Cancel task` (`node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> CANCELLED --reason "<reason>"`).
4. If `Revise`, specification edits are allowed (task artifact); implementation remains blocked until a fresh `approve`.

## Outputs
`approvals.<gate>` status `rejected` with reason; audit event `approval-rejected`; optionally CANCELLED.

## Failure behavior
CLI errors shown verbatim.

## Safety restrictions
Never edit `task.yaml` directly. A rejected specification MUST NOT be implemented.
