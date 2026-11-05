---
name: handoff
description: Hand a ticket over to design or development after a human has approved the acceptance criteria in the web UI. Use when the PM runs /aisdlc-pm:handoff. Never approves.
argument-hint: <TICKET> dev|design
disable-model-invocation: true
---

# handoff

## Purpose
Move a ticket on to the designer (`HANDED_OFF_TO_DESIGN`) or the developer (`HANDED_OFF_TO_DEV`) once a human has approved the `acceptance_criteria` gate in the web UI. This skill never approves anything.

## Invocation conditions
Explicit `/aisdlc-pm:handoff <TICKET> dev|design`.

## Procedure
1. Refresh the mirror: `node ${CLAUDE_PLUGIN_ROOT}/scripts/server/aisdlc-server.js pull <TICKET>`. Read `tasks/<TICKET>/server-ticket.json` to see whether the `acceptance_criteria` gate is approved.
2. Transition locally: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> HANDED_OFF_TO_DEV` (or `HANDED_OFF_TO_DESIGN`). The hook refuses this transition unless the last pulled `server-ticket.json` shows the gate approved; if it refuses, approve in the web UI first.
3. Preview the push: `node ${CLAUDE_PLUGIN_ROOT}/scripts/server/aisdlc-server.js push <TICKET> --dry-run`. Confirm, then run it without `--dry-run`.
4. Report the `sync` outcome:
   - If the gate is approved, the server moves the ticket to `DESIGN_BRIEF` or `TICKET_READY`.
   - If it is **not** approved, the walk stops with `APPROVAL_MISSING` and prints a line like **"stopped before DESIGN_BRIEF ... acceptance_criteria has not been approved"**. The server gate is the blocker. The walk tries the phase adjacent to `ACCEPTANCE_CRITERIA_DEFINED` (which is `DESIGN_BRIEF`) first, so the message says "before DESIGN_BRIEF" even for a dev hand-off. Explain that a human approves the gate in the web UI, then the PM runs `/aisdlc-pm:push <TICKET>` again to complete the move. Do not loop or retry.
5. For `bug`/`investigation` tickets, the PM plugin does not drive those lifecycles, so hand them over with an explicit `push <TICKET> --to TICKET_READY`.

## Safety restrictions
- Never approves the `acceptance_criteria` gate; that is a human web UI action.
- Surfaces the "stopped before ..." message verbatim rather than retrying or forcing the move.
