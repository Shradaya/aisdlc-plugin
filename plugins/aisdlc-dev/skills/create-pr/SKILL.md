---
name: create-pr
description: The one pull-request command for a ticket - open a PR from the task branch into each target branch (default lf-develop, lf-qa, lf-uat; main only when the developer names it) of every affected repository with the repository's default reviewers, resolve a conflicting target on the ticket's environment branch ({TICKET}-{env}), on a later run track CI and record the merge, and decline or replace one of the ticket's PRs when explicitly asked. Use only when the developer runs /aisdlc-dev:create-pr or confirms the PR stage of a workflow.
argument-hint: <ticket-number> [target-branches] [--draft]
disable-model-invocation: true
---

# create-pr

## Purpose
The single pull-request command for a ticket (spec §39, §40). It replaces the former `pr`, `pull-request` and `promote`
commands. Per repository and target it:
- **creates** the PR straight from the task branch `<TICKET>` when the merge is clean;
- **resolves** a conflicting target on the ticket's environment branch `<TICKET>-<env>` and opens the PR from there; the
  task branch is never touched and a target is never edited;
- **tracks** CI and records the merge when it runs again after every PR exists;
- **declines or replaces** one of the ticket's PRs, only when the developer explicitly asks and confirms each one.

Every PR is created with the repository's default reviewers and a description in the template below. It's safe to
re-run: each run only does what is still open.

## Invocation conditions
Explicit `/aisdlc-dev:create-pr <ticket-number> [target-branches] [--draft]`, or the PR stage of the feature, bug and
sibling workflows after the developer confirms it. `$ARGUMENTS` = `<ticket-number>`, an optional comma-separated list of
targets (for example `lf-develop,lf-qa`, or `main` when the developer explicitly wants a PR into the base branch) and an
optional `--draft` flag that opens every new PR as a draft. Never run on the model's own initiative.

## Inputs
Task state; `jira.md`, `specification.md` (feature), `implementation-plan.md`, `validation.md`, `code-review.md`;
`config/integrations.yaml` (`git_hosting`: `pr_target_branches`, `environments`, `env_branch_format`, `credentials`);
`config/workspace.yaml` (`autonomy.push`, `autonomy.create_pr`); each repository's git state and
`repositories/<repo>/testing.md` (test and lint commands).

## Prerequisites
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` shows COMMITTED (create), or PR_CREATED /
  CI_FAILED (add missing targets, track CI, record the merge), with `commits.<repo>` recorded for each repository.
- Validation and code review complete; every commit subject on the task branch matches `^<TICKET>: \S`.
- Push and PR creation allowed by policy (`autonomy.push`, `autonomy.create_pr`). The developer running this command
  satisfies "policy-controlled"; if the policy says otherwise, ask.
- Bitbucket credentials: `git_hosting.credentials` names `BITBUCKET_EMAIL` and `BITBUCKET_API_TOKEN`. Check only that both
  are set; never print, echo or write their values (the hook blocks it). If either is missing, use the fallback in step 11.
- Targets: by default every branch in `git_hosting.pr_target_branches` (default `lf-develop`, `lf-qa`, `lf-uat`), or the
  subset the argument names. The base branch (`config/workspace.yaml` `git.base_branch`, default `main`) is a target
  **only when the developer explicitly asks for it** (names `main` in the targets or says so in their own words); never
  add it on your own, never infer it from a workflow default, and confirm it in the plan (step 5) as a PR into the base
  branch. Never any other branch: a name that is neither in `pr_target_branches` nor the base branch, ask.

## Procedure
Environment branch names: `node ${CLAUDE_PLUGIN_ROOT}/scripts/git-hosting/env-branch.js <TICKET> <target>...` prints
`{ "branches": { "<target>": "<env branch>" } }` (for example `EL-5739-qa`). Use exactly those names; the commit hook
accepts commits for the ticket only on `<TICKET>` and those branches.

Per repository in the task (path from `scripts/lib/repo-paths.js`; always `git -C <path>`):

### 1. Decide what each target needs
1. **Preflight.** `rev-parse --abbrev-ref HEAD` equals `<TICKET>`, `status --porcelain=v1` is clean for task files,
   `rev-parse HEAD` equals `commits.<repo>`, and no merge, rebase or cherry-pick is in progress. Otherwise stop and report.
2. **Already open?** For each target, look up a recorded `pull_requests.<repo>@<target>`, or
   `bitbucket-pr.js find <path> <source> <target>` with source `<TICKET>`, or `<env branch>` when
   `env_branches.<repo>@<target>` is recorded. A target that already has an open PR goes to **Track** (section 4).
3. **Dry run** the remaining targets, read-only:
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/git-hosting/check-targets.js <path> <TICKET> <target>...` (it fetches `origin`).
   Read `targets[].merge`:
   - `merged`: the ticket is already in that target. Nothing to do; report it.
   - `no-target`: the branch doesn't exist on the remote. Skip and report; never create it.
   - `clean`: **Create** (section 2). If `missing_exports` is not empty (a named import the change uses no longer exists
     on that target), show the list and ask whether to open that PR anyway or fix first; never open it silently.
   - `conflicts`: **Resolve** (section 3). Note the conflicting files and any `same_as` (an earlier target with the
     identical conflict, so one resolution serves both). Exception, the base branch: it has no environment branch, so a
     conflict with `main` is not resolved here. Report the conflicting files and leave that target pending (the task
     branch needs the base merged in, which is implementation work under the normal rules).
4. **Scope check** for every target that will get a new PR: `git log origin/<target>..<TICKET> --format='%h %s'` and
   `git diff --stat origin/<target>...<TICKET>`. If the PR would carry commits that aren't this task's (subjects not
   starting with `<TICKET>:`, or files outside the task's diff), for example because the target lags `main`, show them and
   ask how to proceed. A merge commit that adds no file changes may go ahead if the developer says so. Zero commits ahead
   means nothing to merge: skip and report.
5. **Show the plan and ask once** (AskUserQuestion) before anything leaves the machine: per target, the source branch
   (`<TICKET>` or the environment branch), the conflicting files for Resolve targets, draft or not, and the description
   file. A PR into the base branch is listed separately and named as such, so it's never confirmed by accident.
   Options: proceed / choose a subset / cancel.

### 2. Create (clean targets)
6. Push if needed: `push -u origin <TICKET>`. Never `--force`.
7. Write the description once per repository to `tasks/<TICKET>/pr-descriptions/<repo>.md` (template below); every
   clean target of that repository uses it.
8. Create each PR with the committed helper:
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/git-hosting/bitbucket-pr.js create <path> <TICKET> <target> "<TICKET>: <summary>" tasks/<TICKET>/pr-descriptions/<repo>.md`,
   plus `--draft` when asked. Then continue at step 11.

### 3. Resolve (conflicting targets), one target at a time
Never resolve conflicts on `lf-develop`, `lf-qa`, `lf-uat` or `main`; only on the ticket's environment branch.
9. **Environment branch and merge.**
   - If neither a local nor a remote `<env branch>` exists: `switch -c <env branch> <TICKET>`.
   - If it exists from an earlier run: `switch <env branch>`, then `merge --ff-only origin/<env branch>` when the remote
     has it. When `merge-base --is-ancestor <TICKET> HEAD` fails, bring in the new task-branch work with
     `merge --no-ff --no-commit <TICKET>`, resolve it as below and commit with `-m "<TICKET>: Merge <TICKET> into <env branch>"`.
   - Merge the target, uncommitted: `merge --no-ff --no-commit origin/<target>`. It exits 1 and leaves the merge in
     progress. The commit hook allows source edits on the environment branch only while such a merge is in progress.
10. **Resolve, complete and verify.**
   - Edit only the conflicted files, by intent: the ticket's change and everything the target gained must both survive.
     Read both sides' history first (`git log -5 origin/<target> -- <file>`).
   - Same resolution in every environment: when `same_as` was given, or an earlier environment branch of this ticket
     resolved the same hunk (`git show origin/<ticket-env>:<file>`), repeat it; if it can't apply, stop and ask.
   - Tests: keep both sets. Imports: the union. Schemas, enums and message payloads: the union of fields; stop and ask
     if a field changed meaning. Dependency manifests: both lists, the higher version when both bumped one. Lockfiles:
     take the target's, then regenerate with the repository's tool if dependencies changed. Environment-specific config
     (CI, deploy files, per-environment constants): prefer the target's. Never take one side of a whole file without
     saying why. Unclear business logic: stop and ask.
   - `git diff --check` and `grep -nE '^(<<<<<<<|=======|>>>>>>>)'` on each resolved file must be clean. Stage the files
     by explicit path and `commit -m "<TICKET>: Merge <target> into <env branch>"`: one line, a single `-m`
     (`--no-edit` is blocked by the hook).
   - Verify before anything leaves the machine: `git log --oneline --no-merges origin/<target>..<env branch>` shows only
     `<TICKET>: ` subjects (anything else: stop and list them, never cherry-pick onto the target);
     `check-targets.js <path> <env branch> <target>` reports `clean`; the repository's tests and lint pass
     (`repositories/<repo>/testing.md`). A failure caused by the merge is fixed here and committed as `<TICKET>: <summary>`.
     A failure that isn't merge-specific is a defect of the task: stop and send it back to implementation
     (`transition <TICKET> IMPLEMENTING --reason "<what>"`).
   - Description: `tasks/<TICKET>/pr-descriptions/<repo>-<env>.md`, the template below, plus under "Additional
     implementation details" one line per resolved file: what each side had and what was kept.
   - `push -u origin <env branch>` (never `--force`), then
     `node ${CLAUDE_PLUGIN_ROOT}/scripts/git-hosting/bitbucket-pr.js create <path> <env branch> <target> "<TICKET>: <summary>" tasks/<TICKET>/pr-descriptions/<repo>-<env>.md`
     (plus `--draft` when asked), and record `env_branches.<repo>@<target>` (step 12). Finish with `switch <TICKET>`.
   - To give up at any point: `merge --abort`, `switch <TICKET>`, report.

### Every new PR
11. **The helper's result.** `bitbucket-pr.js create` prints one JSON line with the PR `url`, `draft` and `reviewers` (the
    repository's default reviewers minus the author). Report the reviewer names. A `reviewers_error` means the token can't
    read the default reviewers: the PR was created without them; tell the developer to add them in Bitbucket. An
    already open PR for the same source and destination is returned (`existing: true`), never duplicated or changed, so
    a draft request doesn't convert it. If a requested draft comes back with `draft: false` or the API rejects the flag,
    report it and ask; don't retry silently without the flag. Never call the API any other way (no ad-hoc scripts or
    curl).
    Fallback, only when the credentials are unset (exit 2) or the API returns an error: give the developer, per target,
    `https://bitbucket.org/<workspace>/<repo>/pull-requests/new?source=<source>&dest=<target>&t=1` (workspace and repo
    from `git remote get-url origin`, any credentials stripped), tell them to confirm the destination and add the default
    reviewers, point them to the description file, and ask for the resulting PR URL.
12. **Record.** `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> pull_requests.<repo>@<target> '"<url>"'`,
    and for a Resolve target also `... set <TICKET> env_branches.<repo>@<target> '"<env branch>"'`. Append audit
    `pr-created` (repository, target, url, source branch, reviewers, conflicts resolved; no secrets) to
    `tasks/<TICKET>/execution-log.jsonl`. Add the PR link to Jira only if enabled in `config/integrations.yaml`.
13. When the status is COMMITTED and every repository has a recorded PR for every target that wasn't skipped:
    `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> PR_CREATED`. A target left unresolved
    is pending, not skipped: it keeps the task at COMMITTED. Say which targets are still open.

### 4. Track CI and record the merge (a run after the PRs exist)
14. CI is part of the PR_CREATED state. Append `ci-started`. Read each PR with `bitbucket-pr.js status <path> <pr-id>`
    and CI through the CI integration; record
    `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> ci '{"provider":"<p>","status":"running","checks":{...}}'`.
    CI integration unavailable: ask the developer for the results and record them as user-provided.
15. A failing check: set `ci` with the failing checks, `transition <TICKET> CI_FAILED --reason "<checks>"`. You may
    diagnose it. Any code change follows the normal implementation, validation and commit rules on `<TICKET>`. A new
    commit on the task branch reaches a Resolve target by re-running this command (step 9 merges it into the environment
    branch). All required checks passed: set `ci.status` to `passed` and append `ci-completed`.
16. Merge is human-controlled, and so is the order of the PRs: never merge. When the developer reports, or
    `bitbucket-pr.js status` shows, that a PR is merged, append `merged` with the target. When the PR into the UAT branch
    (the last of `pr_target_branches`, e.g. `lf-uat`) is merged, or the PR into the base branch when the developer asked
    for that one instead of the UAT branch: `transition <TICKET> MERGED`. For a feature, a merge into
    the UAT branch counts as released, so follow with `transition <TICKET> RELEASED` and tell the developer to run
    `/aisdlc-dev:post-release <TICKET>`. For a bug, the task proceeds to COMPLETED through `/aisdlc-dev:finish <TICKET>`.

### 5. Decline or replace a PR (only when the developer explicitly asks)
Only when the developer asks, in their own words, to decline (close without merging) or replace one or more of this
ticket's PRs, for example "decline the lf-qa PR" or "replace 6364". Never on your own initiative, never as a side
effect of another step, and only for PRs recorded for this ticket (`pull_requests.<repo>@<target>`). Someone else's PR
is never declined here; `/aisdlc-dev:pr-review` never declines.
17. **Confirm each PR.** List every PR to decline with its repository, target, source branch, number, title and URL
    (`bitbucket-pr.js status <path> <pr-id>`). Ask once per PR (AskUserQuestion: decline / keep). A PR the developer
    doesn't confirm stays open. A merged PR can't be declined: report it and leave it.
18. **Decline.** For each confirmed PR:
    `node ${CLAUDE_PLUGIN_ROOT}/scripts/git-hosting/bitbucket-pr.js decline-pr <repo-name> <pr-id>` (or
    `decline-pr <pr-id>` from inside the repository). It declines only an open PR; `already_declined: true` means it was
    closed before, so record it the same way. The branches are not touched: declining never deletes `<TICKET>` or an
    environment branch.
19. **Record.** `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> declined_pull_requests.<repo>@<target> '"<url>"'`
    and `... set <TICKET> pull_requests.<repo>@<target> null`, so the target counts as open again. Append audit
    `pr-declined` (repository, target, url, reason in the developer's words if given; no secrets) to
    `tasks/<TICKET>/execution-log.jsonl`. The task status doesn't change.
20. **Replace**, when that was the request: continue with section 1 for those targets in the same run (the plan in
    step 5 shows the replacement PRs, with default reviewers, before anything is pushed). A plain decline stops here; the
    next `create-pr` run treats those targets as missing.

### 6. Report
21. Per repository and target: dry-run result, source branch (task or environment branch), conflicts and how each was
    resolved, tests, PR link, draft flag, reviewers, CI and merge status, and any PR declined or replaced. Then the next
    step: the developer's review and merge, or the targets still open.

## Description template
Use exactly these headings and structure. Keep the optional sections' headings; write `N/A` when they don't apply. A
workspace may provide its own template (for example a team `pr.md`); when its delivery rules say so, use that instead.
Never put HTML comments (`<!-- ... -->`) in a description: Bitbucket shows them as text.

**Keep it short and concise.** Target about 200 words in total (headings excluded). Description: 1 to 3 sentences.
Summary of Changes: at most 6 lines, one short line each, written from the diff; group small changes instead of listing
every file. Additional implementation details: only decisions or trade-offs a reviewer couldn't see from the diff, at
most 4 lines (for a Resolve target, plus one line per resolved file). Deployment Notes: one line, or `N/A`. Don't
restate the diff, paste test output, list every file, narrate the investigation, or repeat the title; refer to the ticket
for background. State test results in one line at most.

```markdown
# Description

<Summary of the change in a few sentences. List any dependencies required for the change (other repositories' PRs, deploy order, config), or "No dependencies".>

# Summary of Changes

- [x] <one checked line per change that is done, written from the diff>
- [ ] <only for work that is intentionally not done in this PR, such as a known follow-up; omit if none>

# Additional implementation details (OPTIONAL)

- [x] <design decisions, trade-offs, behaviour notes worth a reviewer's attention; for an environment branch, each resolved file>
- [ ] <open points or follow-up tickets, if any>

# Deployment Notes (OPTIONAL)

- [ ] <deploy order, config or environment changes, migrations, rollback hint; "N/A" if none>

# Screenshots

## After

<UI change: a placeholder for the developer to attach the screenshot. Otherwise "N/A (no UI change)".>

Design: <for a ticket with a pinned design (specification section 11 "Design references"): pinned version and source commit, for example `v2, <short sha>`. Otherwise omit this line.>

## Before

<UI change: a placeholder for the developer to attach. Otherwise "N/A (no UI change)".>
```

## Outputs
The pushed task branch and any `<TICKET>-<env>` environment branches; `tasks/<TICKET>/pr-descriptions/<repo>.md` (and
`<repo>-<env>.md`); one PR per repository and target, with default reviewers; `pull_requests.<repo>@<target>`,
`env_branches.<repo>@<target>`, `declined_pull_requests.<repo>@<target>` and `ci` in task state; audit events
(`pr-created`, `pr-declined`, `ci-*`, `merged`); PR_CREATED, CI_FAILED, MERGED and RELEASED transitions.

## Failure behavior
Prerequisite not met, branch or commit mismatch, a PR that would carry unrelated commits, an unclear conflict, failing
tests on an environment branch, a push rejected as non-fast-forward, or a hook denial: stop that target, abort any merge
in progress, return to `<TICKET>`, and report; never force. Integration unavailable: the fallback in step 11.

## Safety restrictions
Never commit to, push to, edit or merge into `lf-develop`, `lf-qa`, `lf-uat` or `main`. The only branches this command
creates are `<TICKET>-<env>`. No force-push, no branch deletion, no history rewrite, no `--no-verify`, no automatic merge
(merging and its order are human-controlled), no production deployment, no secrets in descriptions, logs or state. Decline
only this ticket's PRs, only on the developer's explicit request and per-PR confirmation (section 5); never someone
else's PR. Never edit `task.yaml` directly.
