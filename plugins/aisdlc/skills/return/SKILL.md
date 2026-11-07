---
name: return
description: Send a ticket back to an earlier role with a reason - a request for changes. Adds an open item to the ticket's changes file and shows it on the status page. Use only when the person runs /aisdlc:return.
argument-hint: "{TICKET} {pm|design|dev|qa} {reason}"
disable-model-invocation: true
---

# return

## Purpose
Ask another role for changes (for example dev back to pm because an acceptance criterion is unclear, or qa back to dev for a defect). The reason is required and becomes one numbered, open item in `tasks/<TICKET>/changes.md`, the single short file the receiver reads.

## Procedure
1. Parse `$ARGUMENTS`: ticket, target role, reason. Ask for anything missing; the reason must say what to change, in one or two short sentences. Never invent a reason.
2. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/flow/flow.js return <TICKET> <role> --reason "<reason>"`.
3. Say in one line that the ticket is back with that role and that the item is open. Remind the person that the role's own plugin loops back as usual (pm: `/aisdlc-pm:refine`, dev: rework, qa: waits for the developer's fix). Offer `/aisdlc:push` so the receiver sees it.
4. The receiver resolves the item with their next `/aisdlc:handoff`.

## Safety restrictions
Only `flow.js` writes the event and `changes.md`. A return never changes the receiver's own approvals or state; it is a request.
