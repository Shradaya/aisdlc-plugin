---
name: push
description: Pull the latest, then commit your workflow files (tasks, designs, system, repositories, config) as TICKET colon summary and push them to the branch you are on, after you confirm that branch. Never pushes to main. A merge conflict is left for you to resolve. Use only when the person runs /aisdlc:push.
argument-hint: "[TICKET] [summary]"
disable-model-invocation: true
---

# push

## Purpose
Share your work with the team in one step, always on top of the latest changes. The team works on one branch (for example the sprint's `S10`), created and checked out by hand; every push and pull keeps everyone in sync. `main` is the base branch and is never committed or pushed to.

## Procedure
1. **Know the branch.** `node ${CLAUDE_PLUGIN_ROOT}/scripts/git/aisdlc-git.js status`. Note `branch` and `on_base`.
   - If `on_base` is true, **stop**: say that `main` is not pushed to, and tell the person to switch to the team's branch (`git switch <branch>`, or create it by hand first). Do not switch or create branches yourself.
2. **Pull first.** `node ${CLAUDE_PLUGIN_ROOT}/scripts/git/aisdlc-git.js pull`. Your uncommitted workflow files are set aside and put back. Show `waiting` only if it is not empty.
   - If the result has `conflict: true` (or any error), **stop**. Show the message as it is and tell the person to resolve it by hand: `git status`, fix the conflicted files, `git add` them, then `git rebase --continue` (or `git rebase --abort` to go back), then run `/aisdlc:push` again. Do not resolve, abort, reset, stash or retry anything yourself.
3. Re-run `status`. If `files` is empty, say nothing needs committing (and still offer to push existing local commits).
4. Show the changed files grouped by ticket. The commit message must be one line, `<TICKET>: <summary>`. Take the ticket from the argument or from `tickets`; if several tickets changed, ask which one the message names. Write a short summary of what changed; never invent.
5. **Confirm the branch.** Ask once with AskUserQuestion, naming the branch in the question, for example `Commit and push to branch S10 (origin/S10)?`: `Push to <branch>` / `Change the message` / `Cancel`. Always ask, even when the branch looks right; never push without this answer.
6. On confirm: `node ${CLAUDE_PLUGIN_ROOT}/scripts/git/aisdlc-git.js commit --message "<TICKET>: <summary>"`, then `node ${CLAUDE_PLUGIN_ROOT}/scripts/git/aisdlc-git.js push`. The push pulls once more first; a conflict there is handled exactly as in step 2.
7. Report the commit and the branch it was pushed to.

## Safety restrictions
Never commits or pushes to `main` (the script and the hook both refuse; only the very first push of a new, empty repository is allowed). Never creates or switches branches. Stages only `tasks/ designs/ system/ repositories/ config/`: never env files, logs, QA `tests/` or Playwright files. Never `git commit -a`, never `--force`, never `--no-verify`. Never resolves or aborts a merge conflict. Run only the commands above; the script refuses anything else.
