---
name: push
description: Pull the latest, then commit your workflow files (tasks, designs, system, repositories, config) as TICKET colon summary and push them to the shared repository. A merge conflict is left for you to resolve. Use only when the person runs /aisdlc:push.
argument-hint: "[TICKET] [summary]"
disable-model-invocation: true
---

# push

## Purpose
Share your work with the other roles in one step, always on top of the latest changes. Commits go to the current branch (normally `main`); there are no ticket branches.

## Procedure
1. **Pull first.** `node ${CLAUDE_PLUGIN_ROOT}/scripts/git/aisdlc-git.js pull`. Your uncommitted workflow files are set aside and put back. Show `waiting` only if it is not empty.
   - If the result has `conflict: true` (or any error), **stop**. Show the message as it is and tell the person to resolve it by hand: `git status`, fix the conflicted files, `git add` them, `git rebase --continue` (or `git rebase --abort` to go back), then run `/aisdlc:push` again. Do not resolve, abort, reset, stash or retry anything yourself.
2. `node ${CLAUDE_PLUGIN_ROOT}/scripts/git/aisdlc-git.js status`. If `files` is empty, say nothing needs committing (and still offer to push existing local commits).
3. Show the changed files grouped by ticket. The commit message must be one line, `<TICKET>: <summary>`. Take the ticket from the argument or from `tickets`; if several tickets changed, ask which one the message names (one commit may cover several tickets; the message names one). Write a short summary of what changed; never invent.
4. Ask once with AskUserQuestion: `Commit and push` / `Change the message` / `Cancel`.
5. On confirm: `node ${CLAUDE_PLUGIN_ROOT}/scripts/git/aisdlc-git.js commit --message "<TICKET>: <summary>"`, then `node ${CLAUDE_PLUGIN_ROOT}/scripts/git/aisdlc-git.js push`. The push pulls once more first; a conflict there is handled exactly as in step 1.
6. Report the commit and branch.

## Safety restrictions
Stages only `tasks/ designs/ system/ repositories/ config/`: never env files, logs, QA `tests/` or Playwright files. Never `git commit -a`, never `--force`, never `--no-verify`. Never resolves or aborts a merge conflict. The hook enforces these.
