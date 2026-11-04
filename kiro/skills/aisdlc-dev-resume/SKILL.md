---
name: aisdlc-dev-resume
description: Resume an interrupted or failed aisdlc task from the first incomplete safe state after validating task state against repository state. Use when the user wants to resume an aisdlc dev task.
---

# aisdlc dev resume (Kiro)

Verify reality matches the record, then continue; on mismatch stop in CONFLICTED rather than guessing. See `aisdlc-lifecycle-reference` for conventions. Let `DEV=%AI_SDLC_PLUGIN_HOME%\plugins\aisdlc-dev` and `STATE=node %DEV%\scripts\state\aisdlc-state.js`. Run inside a dev workspace.

## Prerequisites
A task exists: `%STATE% get <TICKET>`. Status is not COMPLETED/CANCELLED.

## Procedure
1. Read state: `%STATE% get <TICKET>`. Note `status`, `resume_state`, `reason`, `repositories`, `approvals`, `state_version`.
2. For each repository in the task: resolve its local path via the repo-paths resolver (paths come from `claude.env` placeholders, overridden by `.env` and real env vars):
   `node -e "const r=require(String.raw`%DEV%\scripts\lib\repo-paths.js`);console.log(r.resolveRepoPath('<repo>',{path:'${AISDLC_REPOS_ROOT}/<repo>'}))"`
   or read `AISDLC_REPOS_ROOT` / `AISDLC_REPO_<NAME>` from `claude.env`. If unset or missing, ask the developer to set it; do not search the disk and do not go CONFLICTED for a missing path. Then inspect git state read-only (`git -C <path> status --porcelain=v1 -b`, `rev-parse --abbrev-ref HEAD`, `rev-parse HEAD`).
3. From REPOSITORIES_PREPARED onward the branch MUST equal `<TICKET>` and match `repository-preparation.yaml`. For approved specifications, `approvals.specification.spec_hash` MUST match the current `specification.md` hash (a mismatch means reapproval, not a conflict to overwrite).
4. Determine the last completed gate from `status` and `workflow.*`.
5. Validate required artifacts exist for that point (shortened lifecycle): TICKET_READY `jira.md`; UNDERSTOOD `requirements.md` + `impact-analysis.md` + `knowledge-manifest.yaml` + non-empty `repositories`; REPOSITORIES_PREPARED `repository-preparation.yaml`; SPEC_APPROVED+ `specification.md`; PLAN_APPROVED+ `implementation-plan.md`; IMPLEMENTING+ `validation.md` and `code-review.md` once the review sub-step is done; bug `root-cause.md` from ROOT_CAUSE_CONFIRMED.
6. If repository state differs from the record (wrong branch, unexpected dirty tree, missing branch, concurrent ownership): `%STATE% transition <TICKET> CONFLICTED --reason "<differences>"` and stop. Never guess, switch branches, or reset.
7. If status is a failure state: show `reason` and `resume_state`, resolve the cause with the developer, then continue the workflow of the resume state. The CLI only permits moving forward from `resume_state`; if it rejects a needed transition, report the exact error — do not edit `task.yaml`.
8. Continue from the first incomplete safe stage by following the matching entry skill: feature-family -> `aisdlc-dev-feature` from the matching step; bug -> `aisdlc-dev-bug`; investigation -> `aisdlc-dev-investigate`; after MERGED -> tell the developer to run the post-release stage. Do not repeat completed gates.

## Failure behavior
Any discrepancy: CONFLICTED and stop with a precise expected-vs-actual report.

## Safety restrictions
Never edit `task.yaml` directly. Never alter repositories during inspection. Approval is never inferred.
