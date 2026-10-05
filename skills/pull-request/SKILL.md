---
name: pull-request
description: Push the task branch, create the pull request from task artifacts, track CI and merge in task state. Use only when the developer runs /aisdlc:pr or confirms the PR stage of a workflow.
argument-hint: <ticket-number>
disable-model-invocation: true
---

# pull-request

## Purpose
Create PRs, monitor CI and record merge status (spec §39, §40). Also reachable as `/aisdlc:pr` (alias skill).

## Invocation conditions
Explicit `/aisdlc:pr <ticket-number>` (or `/aisdlc:pull-request`), or the workflow's PR stage after developer confirmation. `$ARGUMENTS` = `<ticket-number>`.

## Inputs
Task state; `jira.md`, `specification.md` (feature), `impact-analysis.md`, `validation.md`, `code-review.md`; `config/integrations.yaml`; `config/workspace.yaml` (push/PR policy).

## Prerequisites
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` shows COMMITTED (create PR) or PR_CREATED/CI_VALIDATING/CI_FAILED (CI tracking).
- Implementation complete, required tests pass, code review complete, commit messages compliant (verify `git -C <path> log main..<TICKET> --format=%s` each match `^<TICKET>: \S`).
- Push and PR creation allowed by policy (`autonomy.push`, `autonomy.create_pr`: policy-controlled; if policy is not satisfied, ask the developer).

## Procedure
### Create
1. Per repository: `git -C <path> push -u origin <TICKET>`. Never `--force`.
2. Generate the PR description from Jira ticket, approved specification, impact analysis, implementation summary and validation results, with sections exactly: Summary, Why, Repositories Changed, Technical Changes, Database Changes, API Changes, Testing, Deployment Notes, Rollback Notes, Related Ticket. No secrets.
3. Bitbucket credentials: `config/integrations.yaml` (`git_hosting.credentials`) names `BITBUCKET_EMAIL` and `BITBUCKET_API_TOKEN`. Check only that both are set (PowerShell `if ($env:BITBUCKET_API_TOKEN) {...}`); never print or write the values. If either is missing, tell the developer to set them (`$env:BITBUCKET_EMAIL = "you@company.com"`, `$env:BITBUCKET_API_TOKEN = "<token>"`) and use the no-integration fallback below meanwhile.
   Save the description to `tasks/<TICKET>/pr-description.md`, then create the PR with the committed helper (Bitbucket REST API): `node ${CLAUDE_PLUGIN_ROOT}/scripts/git-hosting/bitbucket-pr.js create <path> <TICKET> main "<TICKET>: <summary>" tasks/<TICKET>/pr-description.md`. It prints one JSON line with the PR `url`; an already open PR for the same source and destination is returned, never duplicated. Do not call the API with ad-hoc scripts or curl. Fallback only when the credentials are unset or the API returns an error: give the developer the push result and ask them to open the PR; record the URL they give.
4. Record: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> pull_requests.<repo> '"<url>"'`; append audit `pr-created`. Optionally add the PR link to Jira only if enabled in `config/integrations.yaml`.
5. `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> PR_CREATED`.

### CI and merge tracking
6. `... transition <TICKET> CI_VALIDATING`; append `ci-started`. Read the PR state with `bitbucket-pr.js status <path> <pr-id>` and CI via the CI integration; record `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> ci '{"provider":"<p>","status":"running","checks":{"unit":"passed"}}'`.
7. If any check fails: set `ci` with the failing checks, `transition <TICKET> CI_FAILED --reason "<checks>"`; you may diagnose. Any code change in response follows normal implementation, validation and commit rules.
8. All required checks passed: set `ci.status` to `passed`, append `ci-completed`, `transition <TICKET> MERGE_READY` (bug lifecycle has no MERGE_READY: it proceeds to COMPLETED via `/aisdlc:finish`).
9. Merge is human-controlled. Do not merge. When the developer reports/the integration shows the PR merged, verify, append `merged`, and `transition <TICKET> MERGED`.

## Outputs
Pushed branches, PR(s), `ci` and `pull_requests` in task state, optional `pr-description.md`.

## Failure behavior
Prerequisite not met: stop and list what is missing. Push rejected (non-fast-forward): stop; never force; tell the developer. CI integration unavailable: ask the developer for check results and record them as user-provided.

## Safety restrictions
No force-push, no deletion of `main`, no history rewrite, no automatic merge, no production deployment. Never edit `task.yaml` directly.
