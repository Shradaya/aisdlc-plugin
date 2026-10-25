---
name: resume
description: Resume an interrupted or failed aisdlc task from the first incomplete safe state after validating task state against repository state. Use when the developer runs /aisdlc-dev:resume.
argument-hint: <ticket-number>
disable-model-invocation: true
---

# resume

## Purpose
All workflows are resumable (spec §44, §47). Verify reality matches the record, then continue; on mismatch stop in CONFLICTED instead of guessing.

## Invocation conditions
Explicit `/aisdlc-dev:resume <ticket-number>`. `$ARGUMENTS` = `<ticket-number>`.

## Inputs
`tasks/<TICKET>/task.yaml`, `repository-preparation.yaml`, task artifacts, repository git state.

## Prerequisites
A task exists: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>`. Status is not COMPLETED/CANCELLED.

## Procedure
1. Read state: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>`. Note `status`, `resume_state`, `reason`, `repositories`, `approvals`, `state_version`.
2. For each repository in the task: resolve its local path (never from the shell environment alone; `config/repositories.yaml` holds `${AISDLC_REPOS_ROOT}/<repo>` placeholders whose values come from `claude.env`, overridden by `.env` and real environment variables): `node -e "const r=require(process.env.CLAUDE_PLUGIN_ROOT+'/scripts/lib/repo-paths.js');console.log(r.resolveRepoPath('<repo>',{path:'\${AISDLC_REPOS_ROOT}/<repo>'}))"`, or read `AISDLC_REPOS_ROOT` / `AISDLC_REPO_<NAME>` from `claude.env`. If the variable is unset or the path is missing, ask the developer to set it in `claude.env`; do not search the disk and do not transition to CONFLICTED for a missing path. Then inspect git state read-only (`git -C <path> status --porcelain=v1 -b`, `git -C <path> rev-parse --abbrev-ref HEAD`, `git -C <path> rev-parse HEAD`).
3. Compare each current branch with task metadata: from REPOSITORIES_PREPARED onward the branch MUST equal `<TICKET>` and match `repository-preparation.yaml`. For approved specifications, `approvals.specification.spec_hash` MUST match the current `specification.md` hash (a mismatch means reapproval is required, not a conflict to overwrite).
4. Determine the last completed gate from `status` and `workflow.*`.
5. Validate required artifacts exist for that point: TICKET_READY `jira.md`; UNDERSTOOD `requirements.md`; IMPACT_ANALYZED `impact-analysis.md` + `knowledge-manifest.yaml`; REPOSITORIES_IDENTIFIED non-empty `repositories`; REPOSITORIES_PREPARED `repository-preparation.yaml`; SPEC_DRAFTED and later `specification.md`; PLAN_DRAFTED and later `implementation-plan.md`; VALIDATING and later `validation.md`; REVIEWING and later `code-review.md` once review is done; bug tasks `root-cause.md` from ROOT_CAUSE_CONFIRMED.
6. If repository state differs from the record (wrong branch, unexpected dirty tree on a managed branch, missing branch, concurrent ownership by another session): `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> CONFLICTED --reason "<differences>"` and stop. Never guess, never switch branches, never reset.
7. If status is a failure state (BLOCKED, WAITING_FOR_INPUT, WAITING_FOR_APPROVAL, CONFLICTED, FAILED, CI_FAILED, JIRA_CHANGED, SPEC_REVIEW_REQUIRED): show `reason` and `resume_state`, resolve the cause with the developer (AskUserQuestion), then continue the workflow of the resume state. The state CLI only permits moving forward from `resume_state`, so the work of the resume state must be completed before the next `transition`. If the CLI rejects a needed transition, report the exact error to the developer; do not edit `task.yaml`.
8. Continue from the first incomplete safe stage by following the lifecycle's skill: feature-lifecycle types -> `${CLAUDE_PLUGIN_ROOT}/skills/feature/SKILL.md` from the matching step (and `${CLAUDE_PLUGIN_ROOT}/workflows/<type>.md`); bug -> `${CLAUDE_PLUGIN_ROOT}/skills/bug/SKILL.md`; investigation -> `${CLAUDE_PLUGIN_ROOT}/skills/investigate/SKILL.md`; after MERGED -> tell the developer to run `/aisdlc-dev:post-release`. Do not repeat completed gates (for example never re-run repository-preparation once prepared).

## Outputs
Continued workflow; or CONFLICTED with a recorded reason.

## Failure behavior
Any discrepancy: CONFLICTED and stop with a precise report of expected versus actual.

## Safety restrictions
Never edit `task.yaml` directly. Never alter repositories during the inspection steps. Specification approval is never inferred; reapproval needs an explicit developer choice.
