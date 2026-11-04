---
name: sync-main
description: After a release, bring the base branch (main) back into the environment branches (lf-develop, lf-qa, lf-uat) of the registered repositories, one pull request per repository and environment. A clean merge is a PR from main itself; a conflicting one goes through a dated sync branch (main-<env>-<date>) where the conflicts are resolved. Use only when the developer runs /aisdlc-dev:sync-main.
argument-hint: "[repo ...] [target-branch ...]"
disable-model-invocation: true
---

# sync-main

## Purpose
After the release PR (`lf-uat` into `main`) is merged, `main` holds commits the environment branches do not (the release merge, hotfixes). This brings them back so the next feature starts from branches that contain what shipped. It is repository maintenance, not ticket work: no task is created or changed.

## Invocation conditions
Explicit `/aisdlc-dev:sync-main [repo ...] [target-branch ...]`. `$ARGUMENTS` = any registered repository names (default: every registered code repository, not design repositories) and any of `git_hosting.pr_target_branches` (default: all of them). A target a repository does not have is skipped. Anything else in the arguments: ask. Never run on the model's own initiative.

## Inputs
`config/repositories.yaml`, `config/integrations.yaml` (`git_hosting.pr_target_branches`, `environments`, `sync_branch_format`), `config/workspace.yaml` (`git.base_branch`, `main`), each repository's git state and `repositories/<repo>/testing.md`.

## Prerequisites
- Push and PR creation allowed by policy (`autonomy.push`, `autonomy.create_pr`); `BITBUCKET_EMAIL` and `BITBUCKET_API_TOKEN` set (check only that both are set, never print them).
- Skip, and report, any repository whose registered `base_branch` is not the workspace base branch.

## Procedure
Let `BASE` be the base branch and `DATE` today as `YYYYMMDD`. A sync branch is named `<BASE>-<env>-<DATE>` (for example `main-qa-20261105`; the env name comes from `git_hosting.environments`). Always `git -C <path>`; repository paths from `scripts/lib/repo-paths.js`.

### 1. Preflight (read-only)
For each repository:
1. `status --porcelain=v1` must be empty, otherwise list the files and skip the repository; never stash or discard. Note the current branch, to return to it at the end. `fetch origin --prune`.
2. `node ${CLAUDE_PLUGIN_ROOT}/scripts/git-hosting/check-targets.js <path> origin/<BASE> <target>...` (source is `origin/<BASE>`). Per target, in this order:
   - `no-target`: skip, no such branch.
   - `merged`: **already synced.**
   - `tree_equal` true and `behind` 0: **only the release merge commit is missing.** The target already has all of `main`'s content; a PR would change no file. Skip (usually `lf-uat` right after a release). If the contents differ (a hotfix on `main`), it is a real sync: go on.
   - `clean`: PR from `<BASE>` itself. If `missing_exports` is not empty, show it: a named import `main` brought in no longer exists on that target.
   - `conflicts`: needs a sync branch; note the files and any `same_as`.
3. **Open PRs.** For each target that would get a PR: `node ${CLAUDE_PLUGIN_ROOT}/scripts/git-hosting/bitbucket-pr.js find <path> <BASE> <target>`, and for every remote branch matching the sync pattern (`ls-remote --heads origin '<BASE>-<env>-*'`) `find <path> <that branch> <target>`. An open PR means a sync is already in review: report its link and skip the target unless the developer asks to redo it.
4. **Today's sync branch.** For a conflicting target, if `<BASE>-<env>-<DATE>` already exists: reuse it only when it is local only and has no commits beyond `origin/<BASE>` (`rev-list --count origin/<BASE>..<branch>` is 0); otherwise stop and ask. Nothing is ever deleted or recreated.

### 2. Approval 1: the plan
Show a table: repository, target, result (already synced / release merge only, skipped / PR open / clean / conflicts in N files), and what will happen. Then ask once with AskUserQuestion: "Go ahead with this sync plan?". It lists, for each conflicting target, the sync branch that will be created; clean targets go straight on the PR list (step 5). A yes covers exactly that list. Nothing is pushed or opened in this step. Anything that differs afterwards (a new conflict file, a branch that exists): stop and ask again.

### 3. Build each conflict branch
Per repository, one target at a time, in the configured order:
```
git -C <path> switch -c <BASE>-<env>-<DATE> origin/<BASE>
git -C <path> merge --no-ff --no-commit origin/<target>
```
The merge exits 1 and stays in progress. (The commit hook allows source edits on a sync branch only while exactly this merge is in progress.) Resolve, editing only the conflicted files:
- **`main` is the released code.** For anything that shipped in the release, or was hot-fixed on `main`, the result must match `main`.
- **The target has work not yet released** (tickets still in dev, qa or uat). It must survive the sync.
- Both changed the same lines: combine by intent; when the right answer is not clear, show both sides and ask.
- Tests: keep both sets. Imports: the union. Schemas, enums, message payloads: the union of fields; ask if a field changed meaning. Dependency manifests: both lists, the higher version when both bumped one. Lockfiles: take the target's, then regenerate with the repository's tool if the manifest changed. Environment-specific config: prefer the target's. Never take one side of a whole file without saying why.
- The same hunk is resolved the same way in every environment: reuse an earlier target's resolution when `same_as` says the conflict is identical.
- To give up: `merge --abort`, switch back, and report.

Check `git diff --check` and `grep -nE '^(<<<<<<<|=======|>>>>>>>)'` on each resolved file, stage by explicit path, then commit with a single `-m` that starts `Sync <BASE> into <target>: ` followed by a short summary (for example `Sync main into lf-qa: resolve conflicts in 3 files`); the hook rejects any other message, and `git commit --no-edit`.

Write the resolutions to `logs/sync-main/<DATE>/<repo>-<env>.md` (file: what each side had, what was kept); the PR description in step 5 is built from it.

### 4. Verify each conflict branch
- Scope: `git log --oneline --no-merges origin/<target>..<branch>` is exactly `main`'s commits that the target lacks; nothing else.
- `check-targets.js <path> <branch> <target>` reports `clean`.
- The repository's tests and lint (`repositories/<repo>/testing.md`) pass. If they fail, stop and report; do not push.
A clean target needs no build: its PR source is `<BASE>` itself.

### 5. Approval 2: the PR list
Show, per repository and target, what will be pushed and opened, then ask once: "Go ahead with all of this?". For each item:
- Conflict targets: `git -C <path> push -u origin <branch>` (never `--force`).
- The PR: source (`<BASE>`, or the sync branch) into `<target>`, title `Sync <BASE> into <target> (<YYYY-MM-DD>)`, description in the `create-pr` template under its length limits: why (post-release sync), the release or hotfix PRs it brings (`git log --oneline --merges origin/<target>..origin/<BASE>`), the commits from `main`, the resolved conflicts (from step 3) or "No conflicts", and the test result for conflict targets. Write it to `logs/sync-main/<DATE>/<repo>-<env>.md`.
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/git-hosting/bitbucket-pr.js create <path> <source> <target> "<title>" logs/sync-main/<DATE>/<repo>-<env>.md`. It prints the PR url, or `existing: true` for one already open. Stop and ask on any failure. Do not call the API any other way.

### 6. Finish
`git -C <path> switch <original branch>` in each repository. Report a table: repository, target, result (already synced / release merge only / PR open / clean PR / conflict PR), PR link, conflicts resolved (file: how), tests. Sync branches from earlier runs are left in place; list those whose PR has merged so the developer can prune them. Nothing is merged here: the PRs merge through normal review.

## Outputs
Dated sync branches (local and pushed) for conflicting targets; PRs; `logs/sync-main/<DATE>/<repo>-<env>.md`; the PostToolUse hook records the commits and pushes in `logs/audit.jsonl`.

## Failure behavior
A dirty repository, an unexpected branch, a new conflict, failing tests, a push rejected as non-fast-forward, or a hook denial: stop that target, abort any merge in progress, return to the original branch, and report. Never force, never work around a block.

## Safety restrictions
Never commit to, push to, edit or merge into `main` or any environment branch, and never open a PR into `main`. The only branches this skill creates are `<BASE>-<env>-<DATE>`. No force-push, no branch deletion or recreation, no history rewrite, no `--no-verify`, no automatic merge of a PR, no secrets in descriptions or logs. Creates no task and never touches `task.yaml`.
