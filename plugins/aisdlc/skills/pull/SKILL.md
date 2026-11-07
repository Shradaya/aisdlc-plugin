---
name: pull
description: Get the latest shared repository (rebase, keeping your uncommitted workflow files) and show what is waiting for your role - hand-offs received and open change requests. A merge conflict is left for you to resolve. Use when the person runs /aisdlc:pull.
argument-hint: "[--role pm|design|dev|qa]"
---

# pull

## Procedure
1. `node ${CLAUDE_PLUGIN_ROOT}/scripts/git/aisdlc-git.js pull $ARGUMENTS`. It runs `git pull --rebase --autostash`, so your uncommitted workflow files are set aside and put back.
2. If the result has `conflict: true` (or any error), **stop**. Show the message as it is and tell the person to resolve it by hand: `git status`, fix the conflicted files, `git add` them, `git rebase --continue` (or `git rebase --abort` to go back). Do not resolve, abort, reset, stash or retry anything yourself.
3. Otherwise show `waiting`: one short line per ticket (hand-offs received, open change requests with the ask). For a ticket handed to the person's role, name the next command of their role's plugin (pm: `/aisdlc-pm:...`, design: `/aisdlc-design:sync`, dev: `/aisdlc-dev:feature`, qa: `/aisdlc-qa:test`). Do not read or summarise ticket documents unless asked.
4. If `role` is null, tell the person to set it with `/aisdlc:init --role ...`.

## Safety restrictions
Never discards local changes, never force-pulls, never resolves or aborts a conflict.
