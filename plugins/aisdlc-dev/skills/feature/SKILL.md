---
name: feature
description: Primary feature-development workflow for a ticket - from Jira retrieval through specification approval, implementation, validation, review, commit, PR and CI, up to release hand-off to post-release. Use only when the developer runs /aisdlc-dev:feature.
argument-hint: <ticket-number>
disable-model-invocation: true
---

# feature

## Purpose
Drive a feature from ticket to merge/release hand-off under the state machine and gates of spec §18, §19, §21, §52. Detailed lifecycle reference: `${CLAUDE_PLUGIN_ROOT}/workflows/feature.md`.

## Invocation conditions
Explicit `/aisdlc-dev:feature <ticket-number>`. `$ARGUMENTS` = `<ticket-number>`. The refactor, api-change, database-change, dependency-upgrade and documentation skills reuse this procedure with a different task type (they say `TASK_TYPE=<type>`; default is `feature`).

## Inputs
Ticket number matching `^[A-Z][A-Z0-9]*-\d+$`; `${CLAUDE_PLUGIN_ROOT}/config/policies.yaml`, `config/workspace.yaml`, `config/integrations.yaml`.

## Prerequisites
- Valid ticket number, else stop.
- No existing task for the ticket: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>`. If it exists, do not re-init; tell the developer to run `/aisdlc-dev:resume <TICKET>`.
- At least one registered repository (`config/repositories.yaml`).

## Skill invocation convention
Model-invocable stage skills (jira-ticket, impact-analysis, feature-specification, design-link, testing, code-review, product-knowledge-consolidation, adr) are invoked with the Skill tool. Skills marked `disable-model-invocation` (repository-preparation, commit, pull-request, documentation) are performed after the developer has confirmed that step: Read `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md` and follow it in this session. Confirmation for repository-preparation is the repository confirmation in step 8; for commit/PR it is an AskUserQuestion at that stage.

## Procedure
Log an audit line to `tasks/<TICKET>/execution-log.jsonl` (append only) for each event named in spec §45 as stages complete. Record stage completion with `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> workflow.<stage> '"completed"'`.

1. Validate the ticket number. Read `${CLAUDE_PLUGIN_ROOT}/config/policies.yaml`.
2. Retrieve the ticket: jira-ticket phase 1 (Jira REST helper, or interactive fallback; never guess).
3. Create the task: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js init <TICKET> <TASK_TYPE>` (repositories unknown yet). Then jira-ticket phase 2 (writes `jira.md`, snapshot hash) and `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> TICKET_READY`.
4. Understand the requirement: write `tasks/<TICKET>/requirements.md` summarizing what is requested, why, acceptance criteria, constraints, unknowns, suspected domains. Resolve design-affecting unknowns with AskUserQuestion. `transition <TICKET> UNDERSTOOD`.
5-8. Run the impact-analysis skill (identifies domains and candidate repositories, writes `impact-analysis.md`, transitions IMPACT_ANALYZED, confirms affected repositories with the developer, records `repositories`, transitions REPOSITORIES_IDENTIFIED). If any confirmed repository has `"ui": true` in `config/repositories.yaml` (frontend changes are required), ask the developer for the design ticket number (AskUserQuestion with free text; must match `^[A-Z][A-Z0-9]*-\d+$`; the feature ticket itself is allowed when there is no separate design ticket; never guess) and record it: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> design '{"ticket":"<DESIGN-TICKET>"}'`. That number is the design folder name in the registered design repository (`designs/<DESIGN-TICKET>/`, published by the aisdlc-design plugin); ensure a design repository is registered (`/aisdlc-dev:add-repo <name> <path> --kind design`) or ask the developer to register the one the designer pushed.
9. Repository preparation for every affected repository (stash, main, pull ff-only, branch `<TICKET>`); ends in REPOSITORIES_PREPARED.
10-11. Run the feature-specification skill: specification, then (only when an affected repository has `"ui": true` in `config/repositories.yaml`) the design-link skill before the approval checkpoint, so the feature is specified, planned and built from the design and the approved specification pins its version; approval checkpoint (Approve / Request changes / Reject task), ends in SPEC_APPROVED. Show: "Implementation is BLOCKED until specification approval." STOP here until approved.
12. Implementation plan: launch `implementation-planner` with the approved specification, impact analysis, manifest knowledge and repository testing profiles. It writes `tasks/<TICKET>/implementation-plan.md` per spec §25 (per-repo files/modules, new files, detailed steps, tests; cross-repo sequencing, migration ordering, validation checkpoints, rollback checkpoints) and references the specification. `transition <TICKET> PLAN_DRAFTED`.
13. Plan approval is required for cross-repository, database, API, security-sensitive or high-risk changes (see `${CLAUDE_PLUGIN_ROOT}/config/policies.yaml`). If required: `transition <TICKET> AWAITING_PLAN_APPROVAL`, ask the developer (AskUserQuestion: Approve plan / Request changes / Reject task), on approval `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js approve <TICKET> plan`. The CLI does not enforce plan approval; you must not proceed without it. If not required, state the reason.
14. Pre-implementation checks: run the jira-ticket drift check (if Jira available). Confirm `approvals.specification.status` is `approved` via `get`. Then `transition <TICKET> IMPLEMENTING` (the CLI refuses without spec approval).
    a. First run the testing skill in `write` mode: the `test-writer` agent writes black-box tests from the approved specification only.
    b. Implement per the plan, repository by repository, only in repositories recorded in the task and on branch `<TICKET>`.
    c. Implementation rules (spec §26): small reviewable changes; every change traceable to the approved spec; run relevant tests incrementally; no unrelated cleanup; no public-interface change unless the spec permits; no dependency upgrades unless required; update validation evidence as tests run. MUST NOT: touch unrelated repositories or out-of-scope config, change architecture without updating spec or ADR, silently expand scope, disable tests to pass CI, delete failing tests without documented replacement coverage.
    d. MUST NOT edit, delete or skip tests written by `test-writer`. Failing test output is the only feedback from them; if a test seems wrong, stop and escalate to the developer (spec correction goes through reapproval).
    e. If implementation requires a spec change, edit the spec and obtain reapproval (feature-specification step 6) before continuing.
15-16. `transition <TICKET> VALIDATING`; run the testing skill in `run` mode (repository-specific tests, then cross-repository validation); results go to `validation.md`. Do not proceed until validation completion (spec §14.3) is met.
17. `transition <TICKET> REVIEWING`; run the code-review skill (independent reviewer agents; security review where applicable). Run the documentation skill for technical documentation impact and ADR proposals (adr skill when spec §43 triggers apply). Apply fixes through the normal implementation rules and re-validate.
18. `transition <TICKET> COMMITTING`; ask the developer to confirm; follow the commit skill per repository; `transition <TICKET> COMMITTED`.
19. Technical knowledge refresh (spec §49): follow `refresh-repo` for each changed repository against the resulting commit. Push / create PR according to policy: follow the pull-request skill; `transition <TICKET> PR_CREATED`.
20. `transition <TICKET> CI_VALIDATING`; follow the pull-request skill's CI step. CI failure: `transition <TICKET> CI_FAILED --reason "<failing checks>"`; diagnose, and fix only under normal implementation and commit rules.
21. Merge according to policy: merge is human-controlled (`config/workspace.yaml` approvals.merge). When checks pass: `transition <TICKET> MERGE_READY`. After the developer merges and it is verified: `transition <TICKET> MERGED`. Never merge for the developer.
22-28. Production release verification, consolidation, cleanup and completion belong to `/aisdlc-dev:post-release <TICKET>` and `/aisdlc-dev:finish <TICKET>`. Stop after MERGED and tell the developer: when the release is in production run `/aisdlc-dev:post-release <TICKET>`, then `/aisdlc-dev:finish <TICKET>`. Production deployment is disabled and is never performed here.

## Outputs
`tasks/<TICKET>/{jira.md,requirements.md,impact-analysis.md,knowledge-manifest.yaml,repository-preparation.yaml,specification.md,implementation-plan.md,validation.md,code-review.md,documentation.md}`; for UI features also `system/designs/<DESIGN-TICKET>/` (durable, keyed by the design ticket, may be shared by several feature tickets); commits on branch `<TICKET>` in each affected repository; PR(s); task state and audit log.

## Failure behavior
Unrecoverable or ambiguous situation: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> <BLOCKED|WAITING_FOR_INPUT|WAITING_FOR_APPROVAL|CONFLICTED|FAILED> --reason "<why>"` and stop. Repository state differing from recorded state is CONFLICTED. Never guess through a conflict. All workflows are resumable via `/aisdlc-dev:resume`.

## Safety restrictions
- No source edits before SPEC_APPROVED (enforced by hook; do not attempt workarounds, including shell writes).
- Only `<TICKET>` branches; commits exactly `<TICKET>: <changes summary>`.
- Never force-push, rewrite history, touch production, print or log secrets.
- Never edit `task.yaml`; use `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js` only.
- Never call `approve` without an explicit developer choice.
