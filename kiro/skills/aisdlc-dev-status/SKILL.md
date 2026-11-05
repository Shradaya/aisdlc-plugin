---
name: aisdlc-dev-status
description: Show aisdlc dev workspace status - registered repositories and knowledge freshness, active tasks and their states, pending approvals, conflicts, non-compliant repositories. Read-only. Use when the user asks for the status of an aisdlc dev workspace.
---

# aisdlc dev status (Kiro)

Display the workspace overview. Read-only. See `aisdlc-lifecycle-reference` for the `AI_SDLC_PLUGIN_HOME` setup. Let `DEV=%AI_SDLC_PLUGIN_HOME%\plugins\aisdlc-dev` and `STATE=node %DEV%\scripts\state\aisdlc-state.js`. Run inside a dev workspace.

## Procedure
1. **Repositories:** read `config/repositories.yaml`. For each, compare `analyzed_commit` in `repositories/<name>/repository.yaml` with `git -C <path> rev-parse HEAD` (read-only). Report `current`, `needs-refresh` (differs), or `unknown` (no knowledge package). Flag any `base_branch != main` as non-compliant, and any missing path. Skip `kind: design` repositories from the compliance check (they are read-only design sources).
2. **Tasks:** list `tasks/*/task.yaml`; for each run `%STATE% get <TICKET>`. Show id, type, status, repositories, and `resume_state` / `reason` for failure states. Include `%STATE% next <TICKET>` as the suggested next step.
3. **Pending approvals:** `approvals.specification` / `approvals.plan` / `approvals.design` with status `pending` or `rejected` on a task at an approval state.
4. **Unresolved conflicts:** tasks in CONFLICTED, FAILED, CI_FAILED, JIRA_CHANGED, SPEC_REVIEW_REQUIRED, BLOCKED.
5. **Integrations / credentials:** report credential environment variables by name only as `set` or `missing` (`JIRA_EMAIL`, `JIRA_API_TOKEN`, `BITBUCKET_EMAIL`, `BITBUCKET_API_TOKEN`); never show a value.
6. Print a concise report: Repositories, Active tasks (with next step), Pending approvals, Blocking issues.

## Safety
Strictly read-only. Never run `init`, `transition`, `approve`, `reject`, or `set`.
