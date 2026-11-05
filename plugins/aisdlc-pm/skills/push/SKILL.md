---
name: push
description: Send work to the AISDLC server - push <TICKET> sends that ticket's PM files (requirements.md, acceptance-criteria.md) and, following the local state, moves the server ticket; push * sends all local tickets; push plugin sends the PM-writable workspace knowledge (config/, system/product). Use when the user runs /aisdlc-pm:push or asks to push, sync or upload to the server.
argument-hint: <TICKET> [--reason "..."] | * | plugin  [--dry-run]
---

# push

## Procedure
1. Run a preview first: `node ${CLAUDE_PLUGIN_ROOT}/scripts/server/aisdlc-server.js push $ARGUMENTS --dry-run` (quote `*` as `all` on shells that expand it: `push all`). Show the user which files would be sent.
2. If they agree, run it without `--dry-run`.
3. The server ticket follows the local PM state automatically: `push <T>` sends the local `status` and the server walks forward to the matching phase. You do not pass `--to`; the local state machine drives it. A move backwards (rework) needs `--reason` and is passed only when the user supplies one. Creating a ticket lives in `/aisdlc-pm:ticket-new`, not here.
4. Approvals are never part of a push. The `acceptance_criteria` gate is approved by a human in the web UI. When the walk reaches the hand-off the server stops at that gate and the command prints a "stopped before ..." line (see `/aisdlc-pm:handoff`): this is expected until a human approves. Surface that message; do not loop or retry.
5. Report the result. On "the server has newer versions", run `/aisdlc-pm:pull` for the same target first, merge any `*.server` copies with the user, then push again. On "looks like it contains a secret", remove the secret from the file and push again; never work around the check.

## Notes
- Only files the PM role may push are sent (the server enforces it): `requirements.md` and `acceptance-criteria.md` per ticket, and the PM-writable `config/` and `system/product` for `push plugin`. Unchanged files are skipped.
- Tickets outside the PM phases are view only and are skipped.
