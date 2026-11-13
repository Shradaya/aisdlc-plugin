# Feature Workflow

Reference for `/aisdlc-dev:feature` (spec §18.1, §19, §21-§26, §28A, §42, §52). Procedure lives in `skills/feature/SKILL.md`; this file is the lifecycle contract. Task type `feature` uses the `feature` lifecycle in `${CLAUDE_PLUGIN_ROOT}/config/task-types.yaml`; refactor, api-change, database-change, dependency-upgrade and documentation tasks use the same lifecycle.

## States (in order)

CREATED, TICKET_READY, UNDERSTOOD, REPOSITORIES_PREPARED, SPEC_APPROVED, PLAN_APPROVED, IMPLEMENTING, COMMITTED, PR_CREATED, MERGED, RELEASED, KNOWLEDGE_CONSOLIDATED, COMPLETED.

This lifecycle was shortened by merging intermediate states: UNDERSTOOD covers impact analysis and repository identification; SPEC_APPROVED covers specification drafting and the approval gate; PLAN_APPROVED covers plan drafting and its optional approval; IMPLEMENTING absorbs validation and review as sub-steps; COMMITTED absorbs committing; PR_CREATED absorbs CI validation; MERGED absorbs merge-ready (merge to the UAT branch lands here); RELEASED absorbs release-pending and is reached by the UAT merge; KNOWLEDGE_CONSOLIDATED absorbs its pending pair; COMPLETED absorbs temporary-artifact cleanup. A merge to the UAT branch counts as released — there is no separate production-release state.

Failure states (reachable from any state): BLOCKED, WAITING_FOR_INPUT, WAITING_FOR_APPROVAL, CONFLICTED, FAILED, CANCELLED, CI_FAILED, JIRA_CHANGED, SPEC_REVIEW_REQUIRED. All state changes go through `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition|approve|reject|set`.

## Stage table

| Stage | State on entry -> exit | Skill / agent | Artifact |
|---|---|---|---|
| Ticket | CREATED -> TICKET_READY | jira-ticket | `jira.md` |
| Understand + impact | TICKET_READY -> UNDERSTOOD | feature skill, impact-analysis, impact-analyst | `requirements.md`, `knowledge-manifest.yaml`, `impact-analysis.md` |
| Trace (two or more repositories, or a shared contract) | before REPOSITORIES_PREPARED | cross-repo-trace, service-tracer | `trace.md` |
| Prepare | -> REPOSITORIES_PREPARED | repository-preparation | `repository-preparation.yaml` |
| Specify + approve | -> SPEC_APPROVED | feature-specification, specification-writer, design-link (UI repositories only) | `specification.md`, `system/designs/<DESIGN-TICKET>/` |
| Plan + approve | -> PLAN_APPROVED | implementation-planner | `implementation-plan.md` |
| Implement (incl. validate + review) | -> IMPLEMENTING | testing (write/run), implementation, code-review, documentation, adr | tests, code, `validation.md`, `code-review.md`, `documentation.md` |
| Commit | -> COMMITTED | commit | commits |
| PR / CI | -> PR_CREATED | create-pr (PRs into `pr_target_branches`; conflicts resolved on `<TICKET>-<env>`) | PRs, `ci` state |
| Merge | -> MERGED | create-pr (re-run records the merge) | merge to UAT |
| Release | -> RELEASED | post-release | `release.yaml` (release = UAT merge) |
| Consolidate | -> KNOWLEDGE_CONSOLIDATED | product-knowledge-consolidation, product-knowledge-analyst | `system/product/`, artifacts deleted |
| Finish | -> COMPLETED | finish | - |

## Gates

- Source edits in registered repositories are allowed only from SPEC_APPROVED to COMMITTED and only while the approved specification hash matches (hook-enforced). Spec changes after approval require reapproval.
- Specification approval is explicit human approval (`approve <ticket> specification`), folded into reaching SPEC_APPROVED. The state engine refuses IMPLEMENTING without it. When plan approval is not required, IMPLEMENTING may be reached directly from SPEC_APPROVED (skip edge).
- The feature branch is created from the latest `origin/main` (repository-preparation fetches and branches off `origin/main`); knowledge freshness is measured against the latest `origin/main`.
- UI features (an affected repository has `"ui": true`) ask the developer for a design ticket number (while understanding, at UNDERSTOOD) and pin a version of the authored design for that ticket, read read-only from the registered design repository (`designs/<DESIGN-TICKET>/`, published by the aisdlc-design plugin), in the specification's "Design references" (`design-link`); the feature is built from the design. Approval of the specification approves the pin; changing the pin after approval changes the hash and requires reapproval. Design folders under `system/designs/` are durable and are not deleted by cleanup.
- Plan approval (`approve <ticket> plan`) is required for cross-repository, database, API, security-sensitive and high-risk changes (`${CLAUDE_PLUGIN_ROOT}/config/policies.yaml`), folded into reaching PLAN_APPROVED; the state engine does not enforce it, the workflow does.
- Ticket drift before implementation: JIRA_CHANGED -> SPEC_REVIEW_REQUIRED -> reapproval; implementation blocked meanwhile.
- Validation and review are sub-steps of IMPLEMENTING: validation completion (spec §14.3) precedes the review sub-step, and both precede COMMITTED. Reviewers see only requirement, code and tests.
- Tests are black-box, written by `test-writer` from the approved specification; the implementer must not edit them.
- Release = merge to the UAT branch (e.g. `lf-uat`). Merge is human-controlled. Production deployment is disabled.
- COMPLETED requires KNOWLEDGE_CONSOLIDATED (which now also covers temporary-artifact cleanup); artifacts are deleted only by the consolidation workflow after validation and the consolidation commit.

## Implementation rules (spec §26)

Work only in task repositories on branch `<ticket>`; small reviewable changes traceable to the specification; run relevant tests incrementally; no unrelated cleanup, public-interface changes, or dependency upgrades unless the specification permits; never disable or delete tests to make CI pass; no architecture change without updating the specification or a decision record.
