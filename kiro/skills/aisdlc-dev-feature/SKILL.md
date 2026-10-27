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
2. Retrieve the ticket: jira-ticket phase 1 (MCP, or ask the developer; never guess). Read `%DEV%\skills\jira-ticket\SKILL.md`.
3. Create the task: `%STATE% init <TICKET> <TASK_TYPE>`. Then jira-ticket phase 2 (writes `jira.md`, snapshot hash) and `%STATE% transition <TICKET> TICKET_READY`.
4. Understand: write `tasks/<TICKET>/requirements.md` (what, why, acceptance criteria, constraints, unknowns, suspected domains). Resolve design-affecting unknowns with the developer. `%STATE% transition <TICKET> UNDERSTOOD`.
5-8. Impact analysis (`%DEV%\skills\impact-analysis\SKILL.md`): identify domains and candidate repositories, write `impact-analysis.md`, `transition IMPACT_ANALYZED`, confirm affected repositories with the developer, record `repositories`, `transition REPOSITORIES_IDENTIFIED`. If any confirmed repository has `"ui": true` in `config/repositories.yaml`, ask the developer for the design ticket number (free text, `^[A-Z][A-Z0-9]*-\d+$`; the feature ticket is allowed when there is no separate design ticket; never guess) and record it: `%STATE% set <TICKET> design "{\"ticket\":\"<DESIGN-TICKET>\"}"`. Ensure a design repository is registered (`aisdlc-dev-add-repo` with `--kind design`) or ask the developer to register the one the designer pushed.
9. Repository preparation for every affected repository (stash, main, pull ff-only, branch `<TICKET>`): read `%DEV%\skills\repository-preparation\SKILL.md`; ends in REPOSITORIES_PREPARED.
10-11. Specification (`%DEV%\skills\feature-specification\SKILL.md`): write the specification; then (only when an affected repository has `"ui": true`) run the `design-link` stage (`%DEV%\skills\design-link\SKILL.md`) to pin the authored design into the spec. Then the approval checkpoint — ask the developer to choose `Approve specification` / `Request changes` / `Reject task`. On approve: `%STATE% approve <TICKET> specification` then `%STATE% transition <TICKET> SPEC_APPROVED`. State clearly: implementation stays blocked until the specification is approved. STOP here until approved.
12. Implementation plan (`%DEV%\skills\implementation-planner` content / the implementation-planner agent): write `tasks/<TICKET>/implementation-plan.md` referencing the specification. `%STATE% transition <TICKET> PLAN_DRAFTED`.
13. Plan approval is required for cross-repository, database, API, security-sensitive or high-risk changes (`%DEV%\config\policies.yaml`). If required: `transition AWAITING_PLAN_APPROVAL`, ask the developer, on approval `%STATE% approve <TICKET> plan`. The CLI does not enforce plan approval; do not proceed without it. If not required, state the reason.
14. Pre-implementation checks: jira drift check if Jira is available; confirm `approvals.specification.status` is `approved` via `get`. `%STATE% transition <TICKET> IMPLEMENTING` (the CLI refuses without spec approval).
    a. First run the testing stage in `write` mode: black-box tests from the approved specification only (`%DEV%\skills\testing\SKILL.md`).
    b. Implement per the plan, repository by repository, only in recorded repositories on branch `<TICKET>`.
    c. Small reviewable changes traceable to the spec; run relevant tests incrementally; no unrelated cleanup; no public-interface change unless the spec permits; no dependency upgrades unless required. Do not edit or delete the black-box tests; failing output is the only feedback from them.
    d. If implementation needs a spec change, edit the spec and get re-approval before continuing (the spec hash change requires it).
15-16. `transition VALIDATING`; testing stage `run` mode; results to `validation.md`. Do not proceed until validation completion is met.
17. `transition REVIEWING`; code-review stage (independent reviewers; security review where applicable); documentation stage for technical-doc impact and ADR proposals. Apply fixes under the normal rules and re-validate.
18. `transition COMMITTING`; confirm with the developer; follow the commit stage per repository; `transition COMMITTED`.
19. Push / PR per policy: follow the pull-request stage; `transition PR_CREATED`.
20. `transition CI_VALIDATING`; follow the CI step. CI failure: `transition CI_FAILED --reason "<checks>"`; diagnose and fix only under the normal rules.
21. Merge is human-controlled. When checks pass: `transition MERGE_READY`. After the developer merges and verifies: `transition MERGED`. Never merge for the developer.
22. Stop after MERGED and tell the developer: when the release is in production, run the post-release stage, then finish the task. Production deployment is never performed here.

## Outputs
`tasks/<TICKET>/{jira.md,requirements.md,impact-analysis.md,knowledge-manifest.yaml,repository-preparation.yaml,specification.md,implementation-plan.md,validation.md,code-review.md,documentation.md}`; for UI features `system/designs/<DESIGN-TICKET>/`; commits on branch `<TICKET>`; PR(s); task state and audit log.

## Failure behavior
Unrecoverable or ambiguous: `%STATE% transition <TICKET> <BLOCKED|WAITING_FOR_INPUT|WAITING_FOR_APPROVAL|CONFLICTED|FAILED> --reason "<why>"` and stop. Repository state differing from the record is CONFLICTED. Never guess through a conflict. Resume with the `aisdlc-dev-resume` skill.

## Safety restrictions
- No source edits before SPEC_APPROVED (follow by discipline; the CLI refuses IMPLEMENTING without approval).
- Only `<TICKET>` branches; commits exactly `<TICKET>: <summary>`. Never force-push, rewrite history, touch production, or print/log secrets.
- Never edit `task.yaml`; use the state CLI only. Never call `approve` without an explicit developer choice.
