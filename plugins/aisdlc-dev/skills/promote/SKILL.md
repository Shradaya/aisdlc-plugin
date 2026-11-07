---
name: promote
description: Open the pull request into a target branch (lf-develop, lf-qa, lf-uat) that the task branch cannot merge into cleanly - build the ticket's environment branch ({TICKET}-{env}), merge the target into it, resolve the conflicts, verify, push and open the PR from that branch. Use only when the developer runs /aisdlc-dev:promote, typically after /aisdlc-dev:create-pr reported conflicts.
argument-hint: <ticket-number> [target-branches]
disable-model-invocation: true
---

# promote

## Purpose
`/aisdlc-dev:create-pr` opens a PR straight from the task branch `<TICKET>` into each target and refuses a target it would conflict with. `promote` handles exactly those targets: it creates the ticket's **environment branch** `<TICKET>-<env>` (for example `EL-5739-qa`), merges the target into it, resolves the conflicts there, and opens the PR from the environment branch into the target. The task branch is never touched, and a target is never edited.

## Invocation conditions
Explicit `/aisdlc-dev:promote <ticket-number> [target-branches]`. `$ARGUMENTS` = `<ticket-number>` and an optional comma-separated subset of the targets (for example `lf-qa,lf-uat`); with none, every target that is not yet covered. Never run on the model's own initiative.

## Inputs
Task state; `jira.md`, `specification.md` (feature), `validation.md`, `code-review.md`; `config/integrations.yaml` (`git_hosting`: `pr_target_branches`, `environments`, `env_branch_format`); each repository's git state and `repositories/<repo>/testing.md` for its test and lint commands.

## Prerequisites
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` shows COMMITTED or PR_CREATED, with `commits.<repo>` recorded for each repository.
- Push and PR creation allowed by policy (`autonomy.push`, `autonomy.create_pr`), as for `create-pr`; Bitbucket credentials set (`BITBUCKET_EMAIL`, `BITBUCKET_API_TOKEN`; check only that both are set, never print them).
- Each requested target is one of `git_hosting.pr_target_branches`. Never any other branch.

## Procedure
Names: `node ${CLAUDE_PLUGIN_ROOT}/scripts/git-hosting/env-branch.js <TICKET> <target>...` prints `{ "branches": { "<target>": "<env branch>" } }`. Use exactly those names; the commit hook accepts commits for the ticket only on `<TICKET>` and those branches.

For each repository in the task (path from `scripts/lib/repo-paths.js`; always `git -C <path>`):

### 1. Preflight and dry run
1. `rev-parse --abbrev-ref HEAD` must equal `<TICKET>`, `status --porcelain=v1` must be clean, `rev-parse HEAD` must equal `commits.<repo>`, and no merge, rebase or cherry-pick may be in progress. Otherwise stop and report.
2. `fetch origin --prune`, then `node ${CLAUDE_PLUGIN_ROOT}/scripts/git-hosting/check-targets.js <path> <TICKET> <target>...` and read `targets[].merge`:
   - `conflicts`: continues below.
   - `clean`: **no environment branch is needed.** Say so and point to `/aisdlc-dev:create-pr <TICKET> <target>`; do not create one, even if one exists from earlier.
   - `merged` or `no-target`: nothing to do; report it.
3. Show the plan for the conflicting targets: the environment branch, the conflicting files, and any `same_as` (an earlier target with the identical conflict, so the same resolution applies). Ask with AskUserQuestion before touching anything: proceed with these targets / choose a subset / cancel.

### 2. Per conflicting target, in the order given
4. **Environment branch.** If neither a local nor a remote `<env-branch>` exists: `switch -c <env-branch> <TICKET>`. If it exists (an earlier promotion): `switch <env-branch>`, `merge --ff-only origin/<env-branch>` when the remote has it, and bring in anything new on the task branch: when `merge-base --is-ancestor <TICKET> HEAD` fails, `merge --no-ff --no-commit <TICKET>`, resolve as in step 6, and commit with `-m "<TICKET>: Merge <TICKET> into <env-branch>"`.
5. **Merge the target, uncommitted:** `git -C <path> merge --no-ff --no-commit origin/<target>`. It exits 1 and leaves the merge in progress. (The commit hook allows source edits on `<env-branch>` only while a merge is in progress, which is what makes step 6 possible after PR creation; it allows nothing on `<TICKET>` or the target.)
6. **Resolve.** Edit only the conflicted files.
   - Resolve by intent: the ticket's change and everything the target gained must both survive. Read both sides' history first (`git log -5 origin/<target> -- <file>`).
   - Same resolution in every environment: when `check-targets` gave `same_as`, or an earlier environment branch of this ticket resolved the same hunk (`git show origin/<ticket-env>:<file>`), repeat it; if it cannot apply, stop and ask.
   - Tests: keep both sets. Imports: the union. Schemas, enums and message payloads: the union of fields; stop and ask if a field changed meaning. Dependency manifests: both lists, the higher version when both bumped one. Lockfiles: take the target's, then regenerate with the repository's tool if dependencies changed. Environment-specific config (CI, deploy files, per-environment constants): prefer the target's. Never take one side of a whole file without saying why. Unclear business logic: stop and ask.
   - To give up at any point: `git -C <path> merge --abort`, `switch <TICKET>`, report.
7. **Complete the merge.** `git diff --check` and `grep -nE '^(<<<<<<<|=======|>>>>>>>)'` on each resolved file must be clean; stage the files by explicit path; then `git -C <path> commit -m "<TICKET>: Merge <target> into <env-branch>"`. One line, a single `-m`; `git commit --no-edit` is blocked by the hook.
8. **Verify before anything leaves the machine.**
   - Scope: `git log --oneline --no-merges origin/<target>..<env-branch>`: every subject must start with `<TICKET>: `. Anything else means the PR would carry other work (the target lags `main`, or another ticket's commits): stop and list them; never cherry-pick onto the target.
   - Re-run `check-targets.js <path> <env-branch> <target>`: it must report `clean`.
   - Run the repository's tests and lint (`repositories/<repo>/testing.md`). A failure that comes from the merge is fixed here (commit it as `<TICKET>: <summary>`); a failure that is not merge-specific is a defect of the task: stop, and rework it on `<TICKET>` (`transition <TICKET> IMPLEMENTING --reason "<what>"`) before promoting again.
9. **Description** to `tasks/<TICKET>/pr-descriptions/<repo>-<env>.md`, in the `create-pr` template and under its length limits, plus, under "Additional implementation details", one line per resolved file: what each side had and what was kept. No secrets.
10. **Push and open the PR**, from the environment branch: `git -C <path> push -u origin <env-branch>` (never `--force`), then `node ${CLAUDE_PLUGIN_ROOT}/scripts/git-hosting/bitbucket-pr.js create <path> <env-branch> <target> "<TICKET>: <summary>" tasks/<TICKET>/pr-descriptions/<repo>-<env>.md` (add `--draft` if asked). An already open PR for the same source and destination comes back as `existing: true`. Do not call the API any other way; the fallback is the one in `create-pr` step 6, with `source=<env-branch>`.
11. **Record.** `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> pull_requests.<repo>@<target> '"<url>"'` and `... set <TICKET> env_branches.<repo>@<target> '"<env-branch>"'`; append audit `pr-created` with `repository`, `target`, `url`, `env_branch`, and the number of conflicts resolved, with `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js audit <TICKET> <event> '<details as JSON>'` (the log is hash-chained; never edit it by hand).
12. `git -C <path> switch <TICKET>`.

### 3. Close out
13. When the status is COMMITTED and every repository has a PR recorded for every target that was not skipped, `... transition <TICKET> PR_CREATED`. Otherwise leave the status and say which targets are still open.
14. Report per repository and target: dry run result, environment branch, conflicts and how each was resolved, tests, PR link.

## Outputs
`<TICKET>-<env>` branches (local and pushed); `tasks/<TICKET>/pr-descriptions/<repo>-<env>.md`; PRs; `pull_requests.<repo>@<target>` and `env_branches.<repo>@<target>` in task state; audit events; PR_CREATED when complete.

## Failure behavior
Prerequisite not met, a branch or commit mismatch, unclear conflict, a PR that would carry other tickets' commits, failing tests, a push rejected as non-fast-forward, or a hook denial: stop that target, abort any merge in progress, return to `<TICKET>`, and report. Never force, never work around a block.

## Safety restrictions
Never commit to, push to, edit or merge into `lf-develop`, `lf-qa`, `lf-uat` or `main`. The only branches this skill creates are `<TICKET>-<env>`. No force-push, no branch deletion, no history rewrite, no `--no-verify`, no automatic merge of the PR, no secrets in descriptions, logs or state. Never edit `task.yaml` directly.
