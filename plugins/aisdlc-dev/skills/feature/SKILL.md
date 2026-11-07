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
Log an audit line with `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js audit <TICKET> <event> '<details as JSON>'` (the log is hash-chained; never edit it by hand) (append only) for each event named in spec §45 as stages complete. Record stage completion with `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> workflow.<stage> '"completed"'`.

1. Validate the ticket number. Read `${CLAUDE_PLUGIN_ROOT}/config/policies.yaml`.
2. Retrieve the ticket: jira-ticket phase 1 (Jira REST helper, or interactive fallback; never guess).
3. Create the task: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js init <TICKET> <TASK_TYPE>` (repositories unknown yet). Then jira-ticket phase 2 (writes `jira.md`, snapshot hash) and `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> TICKET_READY`.
4. Understand the requirement: write `tasks/<TICKET>/requirements.md` (in a shared aisdlc repo where the PM already wrote it, read it instead and never overwrite it; record dev-only findings in `impact-analysis.md`) summarizing what is requested, why, acceptance criteria, constraints, unknowns, suspected domains. Resolve design-affecting unknowns with AskUserQuestion. `transition <TICKET> UNDERSTOOD`.
5. Understand + impact (ends in UNDERSTOOD): run the impact-analysis skill (identifies domains and candidate repositories, writes `impact-analysis.md`), then confirm the affected repositories with the developer and record them (`set <TICKET> repositories '[...]'`). The single UNDERSTOOD state now covers impact analysis and repository identification. If any confirmed repository has `"ui": true` in `config/repositories.yaml` (frontend changes are required), record the design key, which is the feature ticket itself: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> design '{"ticket":"<TICKET>"}'`. The designer's folder for this ticket is read later from the registered design repository (`designs/<TICKET>/`, synced by the aisdlc-design plugin); ensure a design repository is registered (`/aisdlc-dev:add-repo <name> <path> --kind design`) or ask the developer to register the one the designer pushed. `transition <TICKET> UNDERSTOOD`.
5b. Cross-repository trace: when the confirmed repositories number two or more, or the change touches a shared contract (a field, collection, endpoint, queue or event payload, shared constant), run the cross-repo-trace skill. It searches the code of every registered repository for those contracts and writes `trace.md`; it may add repositories nobody had listed, so it comes before preparation. The source-edit hook blocks until it is done (`policies.yaml` `feature.require_trace_for_cross_repo`). Single repository and no shared contract: skip it.
6. Repository preparation for every affected repository: run the repository-preparation skill (fetch, update main, branch `<TICKET>` from the latest `origin/main`); ends in REPOSITORIES_PREPARED.
7. Specification (ends in SPEC_APPROVED): run the feature-specification skill — write the specification, then (only when an affected repository has `"ui": true`) the design-link skill before the approval checkpoint, so the feature is built from the design and the approved specification pins its version. The approval checkpoint (Approve / Request changes / Reject task) is folded into reaching SPEC_APPROVED: the single SPEC_APPROVED state covers drafting and the approval gate. Show: "Implementation is BLOCKED until specification approval." STOP here until approved (`approve <TICKET> specification`, then `transition <TICKET> SPEC_APPROVED`).
8. Implementation plan (ends in PLAN_APPROVED): launch `implementation-planner` with the approved specification, impact analysis, manifest knowledge and repository testing profiles. It writes `tasks/<TICKET>/implementation-plan.md` per spec §25 (per-repo files/modules, new files, detailed steps, tests; cross-repo sequencing, migration ordering, validation and rollback checkpoints) and references the specification. Plan approval is always required, whatever the size of the change: ask the developer (Approve plan / Request changes / Reject task) and on approval `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js approve <TICKET> plan`. The single PLAN_APPROVED state covers plan drafting and its approval. `transition <TICKET> PLAN_APPROVED`.
9. Implement (IMPLEMENTING; absorbs validation and review as sub-steps). Pre-checks: run the jira-ticket drift check (if Jira available) and confirm `approvals.specification.status` and `approvals.plan.status` are both `approved` via `get`. Then `transition <TICKET> IMPLEMENTING` (the CLI refuses without spec approval). The CLI refuses IMPLEMENTING without the plan approval too, and there is no way from SPEC_APPROVED straight to IMPLEMENTING.
    a. First run the testing skill in `write` mode: the `test-writer` agent writes black-box tests from the approved specification only.
    b. Implement per the plan, repository by repository, only in repositories recorded in the task and on branch `<TICKET>`.
    c. Implementation rules (spec §26): small reviewable changes; every change traceable to the approved spec; run relevant tests incrementally; no unrelated cleanup; no public-interface change unless the spec permits; no dependency upgrades unless required; update validation evidence as tests run. MUST NOT: touch unrelated repositories or out-of-scope config, change architecture without updating spec or ADR, silently expand scope, disable tests to pass CI, delete failing tests without documented replacement coverage.
    d. MUST NOT edit, delete or skip tests written by `test-writer`. Failing test output is the only feedback from them; if a test seems wrong, stop and escalate to the developer (spec correction goes through reapproval).
    e. Validation sub-step: run the testing skill in `run` mode (repository-specific tests, then cross-repository validation); results go to `validation.md`. Do not leave IMPLEMENTING until validation completion (spec §14.3) is met.
    f. Review sub-step: run the code-review skill (independent reviewer agents; security review where applicable), and the documentation skill for technical documentation impact and ADR proposals (adr skill when spec §43 triggers apply). Apply fixes through the normal implementation rules and re-validate.
    g. If implementation requires a spec change, edit the spec and obtain reapproval (feature-specification step 6) before continuing.
10. Commit (ends in COMMITTED; absorbs the former committing step): ask the developer to confirm, follow the commit skill per repository (commit on branch `<TICKET>`), then `transition <TICKET> COMMITTED`.
11. PR and CI (ends in PR_CREATED; absorbs CI validation): technical knowledge refresh (spec §49) — follow `refresh-repo` for each changed repository against the latest `origin/main`. Then follow the pull-request skill to push and create the PR(s), **targeting the UAT branch** (`config/integrations.yaml` `git_hosting.pr_target_branches`, e.g. `lf-uat`), and `transition <TICKET> PR_CREATED`. Follow the pull-request skill's CI step as part of this state. CI failure: `transition <TICKET> CI_FAILED --reason "<failing checks>"`; diagnose and fix only under normal implementation and commit rules.
12. Merge (ends in MERGED; absorbs merge-ready): merge is human-controlled (`config/workspace.yaml` approvals.merge). When checks pass, the developer merges the PR(s) into the UAT branch. After the merge is confirmed: `transition <TICKET> MERGED`. Never merge for the developer.
13. Released (RELEASED): **a merge to the UAT branch counts as released** — there is no separate production-release step. Once MERGED, `transition <TICKET> RELEASED` and tell the developer to run `/aisdlc-dev:post-release <TICKET>` to consolidate product knowledge.
14. Consolidation and completion (KNOWLEDGE_CONSOLIDATED → COMPLETED): `/aisdlc-dev:post-release <TICKET>` consolidates released behavior into `system/product/` (ends KNOWLEDGE_CONSOLIDATED) and deletes the temporary task artifacts with a cleanup commit; then `/aisdlc-dev:finish <TICKET>` reaches COMPLETED. Production deployment is never performed here.

## Outputs
`tasks/<TICKET>/{jira.md,requirements.md,impact-analysis.md,knowledge-manifest.yaml,trace.md (cross-repository tasks),repository-preparation.yaml,specification.md,implementation-plan.md,validation.md,code-review.md,documentation.md}`; for UI features also `system/designs/<TICKET>/` (durable, keyed by the design ticket, may be shared by several feature tickets); commits on branch `<TICKET>` in each affected repository; PR(s); task state and audit log.

## Failure behavior
Unrecoverable or ambiguous situation: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> <BLOCKED|WAITING_FOR_INPUT|WAITING_FOR_APPROVAL|CONFLICTED|FAILED> --reason "<why>"` and stop. Repository state differing from recorded state is CONFLICTED. Never guess through a conflict. All workflows are resumable via `/aisdlc-dev:resume`.

## Safety restrictions
- No source edits before SPEC_APPROVED (enforced by hook; do not attempt workarounds, including shell writes).
- Only `<TICKET>` branches; commits exactly `<TICKET>: <changes summary>`.
- Never force-push, rewrite history, touch production, print or log secrets.
- Never edit `task.yaml`; use `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js` only.
- Never call `approve` without an explicit developer choice.
