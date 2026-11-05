---
name: push
description: Send work to the AISDLC server - push <TICKET> sends that ticket's files for this role (and optionally moves it to the next phase), push * sends all local tickets, push plugin sends workspace knowledge (repository docs, system docs, design system, QA suite). Use when the user runs /aisdlc-qa:push or asks to push, sync or upload to the server.
argument-hint: <TICKET> [--to PHASE --reason "..."] | * | plugin  [--dry-run]
---

# push

## Procedure
1. Run a preview first: `node ${CLAUDE_PLUGIN_ROOT}/scripts/server/aisdlc-server.js push $ARGUMENTS --dry-run` (quote `*` as `all` on shells that expand it: `push all`). Show the user which files would be sent.
2. If they agree, run it without `--dry-run`.
3. Moving a ticket to another phase (`--to PHASE`) is a lifecycle change: only do it when the user asks. A move backwards needs `--reason`. Approvals are never part of a push; they are human decisions made in the web UI.
4. Report the result. On "the server has newer versions", run `/aisdlc-qa:pull` for the same target first, merge any `*.server` copies with the user, then push again. On "looks like it contains a secret", remove the secret from the file and push again; never work around the check.

## Notes
- Only files your role may push are sent (the server enforces it); unchanged files are skipped.
- Tickets outside your phases are view only and are skipped.
