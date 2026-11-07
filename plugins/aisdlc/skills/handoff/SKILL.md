---
name: handoff
description: Hand a ticket from your role to the next role - your part is done. Records the hand-off, resolves change requests addressed to you, and marks the next role active on the status page. Use only when the person runs /aisdlc:handoff.
argument-hint: "{TICKET} {pm|design|dev|qa} [note]"
disable-model-invocation: true
---

# handoff

## Purpose
Tell the next role the ticket is theirs. A hand-off is one small event file under `tasks/<TICKET>/handoffs/`; the status page shows your stage as done and theirs as active. It does not replace your role's own approvals: it checks them.

## Procedure
1. Parse `$ARGUMENTS`: ticket, target role, optional note. Ask for anything missing (AskUserQuestion); never guess. Valid targets: `pm`, `design`, `dev`, `qa` (not your own role). Flexible order: pm can hand to design and/or dev, design to dev, dev to qa; a role not needed is simply never handed to.
2. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/flow/flow.js handoff <TICKET> <role> --note "<note>"`.
3. If it refuses because you are not ready (for example the acceptance criteria are not approved), relay the reason and the command of your role's plugin that gets you there. Do not use `--force` unless the person explicitly asks for it.
4. If it refuses because change requests are open for you, list them (number and ask) and ask which are resolved (AskUserQuestion, multi-select, plus "all"). Re-run with `--resolve all` or `--resolve 1,3`. Leaving some open needs `--force` and the person's explicit say-so.
5. On success say, in one line, who is now active. Then offer `/aisdlc:push` so the hand-off reaches the other role.

## Safety restrictions
Only `flow.js` writes hand-off events and `changes.md`; never edit them by hand (the hook blocks it). Never infer approval.
