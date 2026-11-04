---
name: aisdlc-dev-feature
description: Primary feature-development workflow for a ticket - from Jira retrieval through specification approval, implementation, validation, review, commit, PR and CI up to release hand-off. Use when the user wants to build a feature under the aisdlc lifecycle in a dev workspace. Also used for refactor, api-change, database-change, dependency-upgrade and documentation task types.
---

# aisdlc feature workflow (Kiro)

Drive a feature from ticket to merge/release hand-off under the aisdlc state machine and gates. See `aisdlc-lifecycle-reference` for conventions, the `AI_SDLC_PLUGIN_HOME` setup, the state CLI, and the gate rules. Let `DEV=%AI_SDLC_PLUGIN_HOME%\plugins\aisdlc-dev` and `STATE=node %DEV%\scripts\state\aisdlc-state.js`.

The ticket must match `^[A-Z][A-Z0-9]*-\d+$`. For refactor/api-change/database-change/dependency-upgrade/documentation, use this same procedure with `TASK_TYPE=<type>` (default `feature`). Run inside a dev workspace (a folder with `config/repositories.yaml`).

## Note on enforcement in Kiro
No PreToolUse hook blocks source edits here. The state CLI still refuses illegal transitions and refuses `IMPLEMENTING` without an approved specification — that is the backstop. Follow the source-edit, commit, and approval rules in `aisdlc-lifecycle-reference` by discipline.

## Stage detail
Each stage's authoritative procedure lives in the plugin's own SKILL files under `%DEV%\skills\<stage>\SKILL.md`. Read the relevant one when you reach that stage.

## Procedure
Log audit lines to `tasks/<TICKET>/execution-log.jsonl` and record stage completion with `%STATE% set <TICKET> workflow.<stage> "\"completed\""` as stages complete.

1. Validate the ticket. Read `%DEV%\config\policies.yaml`.
2. Retrieve the ticket: jira-ticket phase 1 (`node %DEV%\scripts\jira\jira-fetch.js issue <TICKET>`, or ask the developer; never guess). Read `%DEV%\skills\jira-ticket\SKILL.md`.
3. Create the task: `%STATE% init <TICKET> <TASK_TYPE>`. Then jira-ticket phase 2 (writes `jira.md`, snapshot hash) and `%STATE% transition <TICKET> TICKET_READY`.
4. Understand: write `tasks/<TICKET>/requirements.md` (what, why, acceptance criteria, constraints, unknowns, suspected domains). Resolve design-affecting unknowns with the developer. `%STATE% transition <TICKET> UNDERSTOOD`.
5. Understand + impact (ends in UNDERSTOOD, which now covers impact analysis and repository identification): run impact analysis (`%DEV%\skills\impact-analysis\SKILL.md`) — identify domains and candidate repositories, write `impact-analysis.md` — then confirm affected repositories with the developer and record them (`%STATE% set <TICKET> repositories "[...]"`). If any confirmed repository has `"ui": true`, ask the developer for the design ticket number (free text, `^[A-Z][A-Z0-9]*-\d+$`; the feature ticket is allowed when there is no separate design ticket; never guess) and record it: `%STATE% set <TICKET> design "{\"ticket\":\"<DESIGN-TICKET>\"}"`. Ensure a design repository is registered (`aisdlc-dev-add-repo` with `--kind design`). `%STATE% transition <TICKET> UNDERSTOOD`.
6. Repository preparation (`%DEV%\skills\repository-preparation\SKILL.md`): fetch, update main, create branch `<TICKET>` from the latest `origin/main`; ends in REPOSITORIES_PREPARED.
7. Specification (ends in SPEC_APPROVED, which covers drafting + the approval gate): `%DEV%\skills\feature-specification\SKILL.md` — write the specification; then (only when an affected repository has `"ui": true`) run the `design-link` stage (`%DEV%\skills\design-link\SKILL.md`) to pin the authored design into the spec. Ask the developer: `Approve specification` / `Request changes` / `Reject task`. On approve: `%STATE% approve <TICKET> specification` then `%STATE% transition <TICKET> SPEC_APPROVED`. Implementation stays blocked until approved. STOP here until approved.
8. Implementation plan (ends in PLAN_APPROVED, which covers drafting + optional approval): write `tasks/<TICKET>/implementation-plan.md` referencing the specification. Plan approval is required for cross-repository, database, API, security-sensitive or high-risk changes (`%DEV%\config\policies.yaml`): if required, ask the developer and on approval `%STATE% approve <TICKET> plan`; if not required, state the reason. `%STATE% transition <TICKET> PLAN_APPROVED`.
9. Implement (IMPLEMENTING; absorbs validation and review as sub-steps). Pre-checks: jira drift check if Jira is available; confirm `approvals.specification.status` is `approved` via `get`. `%STATE% transition <TICKET> IMPLEMENTING` (the CLI refuses without spec approval; may be reached directly from SPEC_APPROVED via the skip edge when plan approval was not required).
    a. Testing stage `write` mode: black-box tests from the approved specification only (`%DEV%\skills\testing\SKILL.md`).
    b. Implement per the plan, repository by repository, only in recorded repositories on branch `<TICKET>`.
    c. Small reviewable changes traceable to the spec; run tests incrementally; no unrelated cleanup; no public-interface change unless the spec permits; no dependency upgrades unless required. Do not edit or delete the black-box tests.
    d. Validation sub-step: testing stage `run` mode; results to `validation.md`; do not leave IMPLEMENTING until validation completion is met.
    e. Review sub-step: code-review stage (independent reviewers; security review where applicable) and documentation stage for technical-doc impact and ADR proposals. Apply fixes under the normal rules and re-validate.
    f. If implementation needs a spec change, edit the spec and get re-approval before continuing.
10. Commit (ends in COMMITTED): confirm with the developer; follow the commit stage per repository (commit on branch `<TICKET>`); `%STATE% transition <TICKET> COMMITTED`.
11. PR and CI (ends in PR_CREATED; absorbs CI validation): technical knowledge refresh (`refresh-repo`) against the latest `origin/main`; then follow the pull-request stage to push and create the PR(s) **targeting the UAT branch** (`config/integrations.yaml` `git_hosting.pr_target_branches`, e.g. `lf-uat`); `%STATE% transition <TICKET> PR_CREATED`. Follow the CI step as part of this state. CI failure: `transition CI_FAILED --reason "<checks>"`; diagnose and fix only under the normal rules.
12. Merge (ends in MERGED; absorbs merge-ready): merge is human-controlled. When checks pass, the developer merges into the UAT branch. After the merge is confirmed: `%STATE% transition <TICKET> MERGED`. Never merge for the developer.
13. Released (RELEASED): a merge to the UAT branch counts as released — there is no separate production step. `%STATE% transition <TICKET> RELEASED` and tell the developer to run the post-release stage to consolidate product knowledge.
14. Consolidation and completion: post-release consolidates into `system/product/` (ends KNOWLEDGE_CONSOLIDATED, which also covers artifact cleanup) and the finish stage reaches COMPLETED. Production deployment is never performed here.

## Outputs
`tasks/<TICKET>/{jira.md,requirements.md,impact-analysis.md,knowledge-manifest.yaml,repository-preparation.yaml,specification.md,implementation-plan.md,validation.md,code-review.md,documentation.md}`; for UI features `system/designs/<DESIGN-TICKET>/`; commits on branch `<TICKET>`; PR(s); task state and audit log.

## Failure behavior
Unrecoverable or ambiguous: `%STATE% transition <TICKET> <BLOCKED|WAITING_FOR_INPUT|WAITING_FOR_APPROVAL|CONFLICTED|FAILED> --reason "<why>"` and stop. Repository state differing from the record is CONFLICTED. Never guess through a conflict. Resume with the `aisdlc-dev-resume` skill.

## Safety restrictions
- No source edits before SPEC_APPROVED (follow by discipline; the CLI refuses IMPLEMENTING without approval).
- Only `<TICKET>` branches; commits exactly `<TICKET>: <summary>`. Never force-push, rewrite history, touch production, or print/log secrets.
- Never edit `task.yaml`; use the state CLI only. Never call `approve` without an explicit developer choice.
