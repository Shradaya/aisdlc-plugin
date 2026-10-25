---
name: status
description: Show aisdlc workspace status - registered repositories and knowledge freshness, active tasks and states, integrations, pending approvals, conflicts, non-compliant repositories. Read-only.
---

# status

## Purpose
Display the workspace overview defined in spec §50.

## Invocation conditions
`/aisdlc-dev:status`, or when the developer asks what is going on in the workspace.

## Inputs
None.

## Prerequisites
Run from the aisdlc workspace.

## Procedure
1. Repositories: read `config/repositories.yaml`. For each, compare `analyzed_commit` in `repositories/<name>/repository.yaml` with `git -C <path> rev-parse HEAD` (read-only). Report `current`, `needs-refresh` (differs) or `unknown` (no knowledge package). Flag any `base_branch != main` as non-compliant and any missing path.
2. Tasks: list `tasks/*/task.yaml`; for each run `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>`. Show id, type, status, repositories, and `resume_state` / `reason` for failure states.
3. Pending approvals: `approvals.specification` or `approvals.plan` with status `pending` or `rejected` on a task at an approval state (AWAITING_SPEC_APPROVAL, AWAITING_PLAN_APPROVAL, WAITING_FOR_APPROVAL).
4. Unresolved conflicts: tasks in CONFLICTED, FAILED, CI_FAILED, JIRA_CHANGED, SPEC_REVIEW_REQUIRED, BLOCKED.
5. Integrations: for each integration in `config/integrations.yaml`, report `connected` only if its MCP tools are available in this session, else `disconnected` or `not-configured`. Never call write operations. Also report credential environment variables by name only as `set` or `missing` (`JIRA_EMAIL`, `JIRA_API_TOKEN`, `BITBUCKET_EMAIL`, `BITBUCKET_API_TOKEN`); never show a value or a partial value. For each active task, include the line from `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js next <TICKET>` as its suggested next step.
6. Print in the format of spec §50 (Repositories, Active tasks, Integrations, Blocking issues).

## Outputs
Console report only. No files change.

## Failure behavior
An unreadable file is reported as a warning line; continue with the rest.

## Safety restrictions
Strictly read-only. Never run `init`, `transition`, `approve`, `reject` or `set`.
