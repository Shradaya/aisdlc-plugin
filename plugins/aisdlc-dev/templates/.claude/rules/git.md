# Git rules

- Base branch of every managed repository is `main`. A repository with another default branch is non-compliant and cannot enter an implementation workflow.
- Task branch name is exactly the ticket number (for example `FEAT-1234`): no prefix, suffix, user name, date or slug. The one other branch a ticket's commits may land on is its environment branch `<ticket>-<env>` (`/aisdlc-dev:create-pr`, resolving a conflict with a target branch); never any other name. `/aisdlc-dev:sync-main` (post-release) is not ticket work and creates no task: its only branches are `<base>-<env>-<date>` (for example `main-qa-20261105`), committed with `Sync <base> into <target>: <summary>`.
- Preparation per repository: verify no merge/rebase/cherry-pick in progress, stash local changes including untracked files with message `aisdlc: <ticket> pre-task stash`, checkout `main`, `fetch origin --prune`, `pull --ff-only origin main`, create branch `<ticket>`. Never auto-pop the stash. If `main` cannot fast-forward, stop for human resolution. If branch `<ticket>` already exists without an active task record, stop; never overwrite, reset, delete or recreate it.
- Commit message is exactly `<ticket-number>: <changes summary>`: one line, no body, summary describes the actual diff, at most 120 characters. Use a single `-m`. The current branch must equal the ticket number, or be that ticket's environment branch.
- Stage task-related files by explicit path only. No `--amend`, no `--no-verify`, no force push.
- Use `git -C <path>` for registered repositories. Onboarding (`add-repo`, `refresh-repo`) and investigation use read-only git only.
- Merge is human-controlled.
