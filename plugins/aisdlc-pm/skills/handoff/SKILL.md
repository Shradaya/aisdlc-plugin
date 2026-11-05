---
name: handoff
description: Hand a ticket over to design or development after a human has approved the acceptance criteria. Use when the PM runs /aisdlc-pm:handoff. Never approves.
argument-hint: <TICKET> dev|design
disable-model-invocation: true
---

# handoff

## Purpose
Move a ticket on to the designer (`HANDED_OFF_TO_DESIGN`) or the developer (`HANDED_OFF_TO_DEV`) once a human has approved the local `acceptance_criteria` gate. This skill never approves anything.

## Invocation conditions
Explicit `/aisdlc-pm:handoff <TICKET> dev|design`.

## Procedure
1. Check the gate: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` and read `approvals.acceptance_criteria`. If it is not `approved`, tell the PM to approve it first with `/aisdlc-pm:approve <TICKET> acceptance_criteria` (a human decision) and stop. This skill never approves.
2. Transition locally: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> HANDED_OFF_TO_DEV` (or `HANDED_OFF_TO_DESIGN`). The state engine refuses this transition unless the `acceptance_criteria` gate is approved and `acceptance-criteria.md` is unchanged since approval. If it refuses with "has not been approved", approve the gate first; if it refuses with "changed after ... approval", the file was edited after approval, so re-approve before handing off.
3. Report the new state. The designer or developer now owns the ticket and reads the requirements and acceptance criteria from the Jira ticket (the source of truth).

## Safety restrictions
- Never approves the `acceptance_criteria` gate; that is a human decision (`/aisdlc-pm:approve`).
- Surfaces the state engine's refusal verbatim rather than retrying or forcing the move.
