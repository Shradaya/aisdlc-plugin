---
name: release
description: Record a release of a ticket and move it on - qa (PR merged into lf-qa, the initial release to the QA environment, state MERGED), uat (PR merged into lf-uat, counts as released, state RELEASED) or prod (the production release, handled outside this plugin, is done, state PROD_RELEASED) - then push the new state to the AISDLC server so QA or the post-release step can continue. Use only when the developer runs /aisdlc-dev:release.
argument-hint: <ticket-number> qa|uat|prod
disable-model-invocation: true
---

# release

## Purpose
One place where a developer tells the workflow "this ticket is now in the QA environment / in UAT / in production". The plugin never merges and never deploys: merges are human-controlled and the production release is done outside this plugin. This skill checks the evidence, records it in task state and syncs the phase with the server.

| Mode | Meaning | Evidence | From -> to | Server phase afterwards |
|---|---|---|---|---|
| `qa` | Initial release: PR(s) merged into `lf-qa` | PR(s) merged into the QA branch | PR_CREATED -> MERGED | RELEASED_TO_QA (QA starts) |
| `uat` | PR(s) merged into `lf-uat`; **a merge to lf-uat counts as released** | PR(s) merged into the UAT branch, QA passed | MERGED -> RELEASED | RELEASED_TO_UAT (QA runs the regression) |
| `prod` | Production release done outside this plugin | Release reference given by the developer | RELEASED -> PROD_RELEASED | PROD_RELEASE (post-release) |

## Invocation conditions
Explicit `/aisdlc-dev:release <ticket-number> qa|uat|prod`. `$ARGUMENTS` = `<ticket-number> <mode>`. Feature-lifecycle tasks only (feature, refactor, api-change, database-change, dependency-upgrade, documentation). Bug and investigation tasks have no release states: tell the developer to use `/aisdlc-dev:finish`.

## Inputs
Task state (`node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>`: `status`, `pull_requests`, `ci`, `commits`), `config/integrations.yaml` (`git_hosting.pr_target_branches`), the server's view in `tasks/<TICKET>/server-ticket.json`, and for `prod` the QA `regression-results.md`.

## Prerequisites
1. Refresh the server view first: `node ${CLAUDE_PLUGIN_ROOT}/scripts/server/aisdlc-server.js pull <TICKET>`; read `tasks/<TICKET>/server-ticket.json` (`status`, `gates`).
2. Local state and server phase must match the mode:
   - `qa`: local status PR_CREATED.
   - `uat`: local status MERGED **and** server phase QA_PASSED (QA signed off the QA environment). If the phase is still QA-owned or AWAITING_DEV_FIX, stop: tell the developer what QA still has to do.
   - `prod`: local status RELEASED **and** server phase REGRESSION_PASSED and the `regression` gate `approved`. Otherwise stop: the regression is not signed off. Approvals are human decisions in the web UI; never approve here.
3. Any failure: print `BLOCKED` with the reason and change nothing.

## Procedure
1. Verify the evidence for the mode.
   - `qa` / `uat`: for every repository in the task, read the PR state with `node ${CLAUDE_PLUGIN_ROOT}/scripts/git-hosting/bitbucket-pr.js status <path> <pr-id>` (PR ids from `pull_requests.<repo>`) and confirm the PR is merged **into the target branch of the mode** (`lf-qa` for `qa`, `lf-uat` for `uat`). If the integration is unavailable, ask the developer to confirm each merge (AskUserQuestion) and record that the evidence is user-provided. A PR not merged into that branch blocks the whole release.
   - `prod`: ask the developer for the production release reference (ticket, deployment id or tag) and the release time. Never invent them.
2. Record the release: write `tasks/<TICKET>/release.yaml` (append one entry per mode: environment `qa` / `uat` / `production`, reference, `released_at`, `evidence_source` = `integration` or `user-provided`) and `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> release '{"status":"released","environment":"<qa|uat|production>","reference":"<ref>","released_at":"<ts>","evidence_source":"<integration|user-provided>"}'`.
3. Transition: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> MERGED|RELEASED|PROD_RELEASED`. Append audit `release-recorded` (mode, reference) to `tasks/<TICKET>/execution-log.jsonl`.
4. Sync: run the preview `node ${CLAUDE_PLUGIN_ROOT}/scripts/server/aisdlc-server.js push <TICKET> --dry-run`, show it, then push for real (the server follows the new local state). If the output says `stopped before ...`, a gate on the server is still open: tell the developer which one and that approvals are made in the web UI.
5. Say what happens next: `qa` -> QA tests in the QA environment (defects come back as AWAITING_DEV_FIX: `/aisdlc-dev:fix-defect <TICKET>`); `uat` -> QA runs the regression on UAT; `prod` -> `/aisdlc-dev:post-release <TICKET>`, and `/aisdlc-dev:sync-main` to bring `main` back into the environment branches.

## Outputs
`release.yaml`, `release` in task state, state MERGED / RELEASED / PROD_RELEASED, audit event, server phase updated.

## Safety restrictions
- Never merge a PR, deploy, or touch production. `prod` only records what the developer says happened.
- Never apply one ticket's release evidence to another ticket.
- Never approve a server gate; never edit `task.yaml` directly.
