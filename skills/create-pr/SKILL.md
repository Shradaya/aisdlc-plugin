---
name: create-pr
description: Create pull requests from the task branch to lf-develop, lf-qa and lf-uat in every affected repository, using the team's PR description template, and record them in task state. Use only when the developer runs /aisdlc:create-pr.
argument-hint: <ticket-number> [target-branches]
disable-model-invocation: true
---

# create-pr

## Purpose
Open one pull request per target environment branch (`lf-develop`, `lf-qa`, `lf-uat`) from the task branch `<TICKET>` in each affected repository, with a description in the team template. This is the environment-branch counterpart of `/aisdlc:pr` (which targets `main` and tracks CI and merge in `pull-request`).

## Invocation conditions
Explicit `/aisdlc:create-pr <ticket-number> [target-branches]`. `$ARGUMENTS` = `<ticket-number>` and an optional comma-separated subset of the targets (for example `lf-develop,lf-qa`). Never run on the model's own initiative.

## Inputs
Task state; `jira.md`, `specification.md` (feature), `implementation-plan.md`, `validation.md`, `code-review.md`; `config/integrations.yaml` (`git_hosting`, including `pr_target_branches`); each repository's git state.

## Prerequisites
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` shows COMMITTED, or PR_CREATED when adding missing targets, with `commits.<repo>` recorded for each repository.
- Validation and code review complete; every commit subject matches `^<TICKET>: \S` (`git -C <path> log origin/<target>..<TICKET> --format=%s`).
- Push and PR creation are allowed by policy (`autonomy.push`, `autonomy.create_pr`). The developer running this command satisfies "policy-controlled"; if the policy says otherwise, ask.
- Targets come from `git_hosting.pr_target_branches` in `config/integrations.yaml` (default `lf-develop`, `lf-qa`, `lf-uat`), narrowed by the optional argument. Never use any other target.

## Procedure
For each repository in the task (resolve its path with `scripts/lib/repo-paths.js` from `claude.env`; use `git -C <path>`):
1. Inspect read-only: `rev-parse --abbrev-ref HEAD` must equal `<TICKET>`; `status --porcelain=v1` must be clean for task files; `rev-parse HEAD` must equal `commits.<repo>`. Otherwise stop and report.
2. `fetch origin --prune`. For each target: `ls-remote --heads origin <target>`. A missing target branch is skipped and reported, never created.
3. Per target, inspect what the PR will carry: `git log origin/<target>..<TICKET> --format=%h\ %s` and `git diff --stat origin/<target>...<TICKET>`. The task branch was cut from `main`, so if a target lags `main` the PR would also carry commits that are not this task's (subjects not starting with `<TICKET>:`, or files outside the task's diff). In that case do not create that PR: show the extra commits and ask the developer how to proceed. Zero commits ahead means nothing to merge: skip and report.
4. Push if needed: `push -u origin <TICKET>`. Never `--force`.
5. Write the description once per repository to `tasks/<TICKET>/pr-descriptions/<repo>.md` using the template below. The same description is used for each target of that repository. Content comes from the Jira ticket, specification/plan, the repository's diff, and validation and review results; no secrets, no invented screenshots or results.
6. Create each PR: source `<TICKET>`, destination `<target>`, title `<TICKET>: <summary>` (the commit summary), description from the file. Use the configured git-hosting integration (MCP). Credentials come from `BITBUCKET_EMAIL` and `BITBUCKET_API_TOKEN`; check only that both are set, never print or write the values. If no integration is available, give the developer, per target, the URL `https://bitbucket.org/<workspace>/<repo>/pull-requests/new?source=<TICKET>&dest=<target>&t=1` (workspace and repo from `git remote get-url origin`, with any credentials stripped), tell them to confirm the destination shown is `<target>`, point them to the description file, and ask for the resulting PR URL.
7. Record each PR: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> pull_requests.<repo>@<target> '"<url>"'` and append audit `pr-created` (repository, target, url; no secrets) to `tasks/<TICKET>/execution-log.jsonl`.
8. When every repository has a recorded PR for every target that was not skipped, and the status is COMMITTED: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> PR_CREATED`. If PRs are still pending the developer, leave the status and say which ones.

Afterwards the developer's next step is the CI step of the `pull-request` skill (steps 6-9: `CI_VALIDATING`, check results, merge recorded by the developer).

## Description template
Use exactly these headings and structure. Keep optional sections' headings; write `N/A` when they do not apply.

```markdown
# Description

<Summary of the change in a few sentences. List any dependencies required for the change (other repositories' PRs, deploy order, config), or "No dependencies".>

# Summary of Changes

- [x] <one checked line per change that is done, written from the diff>
- [x] <...>
- [ ] <only for work that is intentionally not done in this PR, such as a known follow-up; omit if none>

# Additional implementation details (OPTIONAL)

- [x] <design decisions, trade-offs, behavior notes worth a reviewer's attention>
- [ ] <open points or follow-up tickets, if any>

# Deployment Notes (OPTIONAL)

- [ ] <deploy order, config or environment changes, migrations, rollback hint; "N/A" if none>

# Screenshots

## After

<UI change: leave a placeholder for the developer to attach the screenshot. Otherwise "N/A (no UI change)".>

## Before

<UI change: placeholder for the developer to attach. Otherwise "N/A (no UI change)".>
```

## Outputs
`tasks/<TICKET>/pr-descriptions/<repo>.md`; pushed branch; PRs to each target; `pull_requests.<repo>@<target>` in task state; audit events; PR_CREATED when complete.

## Failure behavior
Prerequisite not met, branch or commit mismatch, a PR that would carry unrelated commits, or a push rejected as non-fast-forward: stop and report; never force. A merge conflict on a target is reported to the developer: never resolve conflicts on `lf-develop`, `lf-qa`, `lf-uat` or `main`. Integration unavailable: fallback in step 6.

## Safety restrictions
No force-push, no automatic merge (merge is human-controlled, and so is the order in which the three PRs are merged), no deletion or creation of target branches, no production deployment, no secrets in descriptions, logs or state. Never edit `task.yaml` directly.
