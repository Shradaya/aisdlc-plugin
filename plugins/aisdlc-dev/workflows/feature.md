# Feature Workflow

Reference for `/aisdlc-dev:feature` (spec §18.1, §19, §21-§26, §28A, §42, §52). Procedure lives in `skills/feature/SKILL.md`; this file is the lifecycle contract. Task type `feature` uses the `feature` lifecycle in `${CLAUDE_PLUGIN_ROOT}/config/task-types.yaml`; refactor, api-change, database-change, dependency-upgrade and documentation tasks use the same lifecycle.

## States (in order)

CREATED, TICKET_READY, UNDERSTOOD, IMPACT_ANALYZED, REPOSITORIES_IDENTIFIED, REPOSITORIES_PREPARED, SPEC_DRAFTED, AWAITING_SPEC_APPROVAL, SPEC_APPROVED, PLAN_DRAFTED, AWAITING_PLAN_APPROVAL (may be skipped when plan approval is not required), IMPLEMENTING, VALIDATING, REVIEWING, COMMITTING, COMMITTED, PR_CREATED, CI_VALIDATING, MERGE_READY, MERGED, RELEASE_PENDING, RELEASED, KNOWLEDGE_CONSOLIDATION_PENDING, KNOWLEDGE_CONSOLIDATED, TEMPORARY_ARTIFACTS_CLEANED, COMPLETED.

Failure states (reachable from any state): BLOCKED, WAITING_FOR_INPUT, WAITING_FOR_APPROVAL, CONFLICTED, FAILED, CANCELLED, CI_FAILED, JIRA_CHANGED, SPEC_REVIEW_REQUIRED. All state changes go through `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition|approve|reject|set`.

## Stage table

| Stage | State on entry -> exit | Skill / agent | Artifact |
|---|---|---|---|
| Ticket | CREATED -> TICKET_READY | jira-ticket | `jira.md` |
| Understand | TICKET_READY -> UNDERSTOOD | feature skill | `requirements.md` |
| Impact | UNDERSTOOD -> IMPACT_ANALYZED -> REPOSITORIES_IDENTIFIED | impact-analysis, impact-analyst | `knowledge-manifest.yaml`, `impact-analysis.md` |
| Prepare | -> REPOSITORIES_PREPARED | repository-preparation | `repository-preparation.yaml` |
| Specify | -> SPEC_DRAFTED -> AWAITING_SPEC_APPROVAL -> SPEC_APPROVED | feature-specification, specification-writer, design-link (UI repositories only, within SPEC_DRAFTED) | `specification.md`, `system/designs/<DESIGN-TICKET>/` |
| Plan | -> PLAN_DRAFTED [-> AWAITING_PLAN_APPROVAL] | implementation-planner | `implementation-plan.md` |
| Implement | -> IMPLEMENTING | testing (write: test-writer), implementation | tests, code |
| Validate | -> VALIDATING | testing (run) | `validation.md` |
| Review | -> REVIEWING | code-review, reviewer agents, documentation, adr | `code-review.md`, `documentation.md` |
| Commit | -> COMMITTING -> COMMITTED | commit | commits |
| PR / CI | -> PR_CREATED -> CI_VALIDATING -> MERGE_READY -> MERGED | pull-request | PR, `ci` state |
| Release | -> RELEASE_PENDING -> RELEASED | post-release | `release.yaml` |
| Consolidate | -> KNOWLEDGE_CONSOLIDATION_PENDING -> KNOWLEDGE_CONSOLIDATED | product-knowledge-consolidation, product-knowledge-analyst | `system/product/` |
| Cleanup | -> TEMPORARY_ARTIFACTS_CLEANED | product-knowledge-consolidation | artifacts deleted |
| Finish | -> COMPLETED | finish | - |

## Gates

- Source edits in registered repositories are allowed only from SPEC_APPROVED to COMMITTED and only while the approved specification hash matches (hook-enforced). Spec changes after approval require reapproval.
- Specification approval is explicit human approval (`approve <ticket> specification`). The state engine refuses IMPLEMENTING without it.
- UI features (an affected repository has `"ui": true`) ask the developer for a design ticket number (after repositories are identified) and pin a version of the authored design for that ticket, read read-only from the registered design repository (`designs/<DESIGN-TICKET>/`, published by the aisdlc-design plugin), in the specification's "Design references" (`design-link`); the feature is built from the design. Approval of the specification approves the pin; changing the pin after approval changes the hash and requires reapproval. Design folders under `system/designs/` are durable and are not deleted by cleanup.
- Plan approval (`approve <ticket> plan`) is required for cross-repository, database, API, security-sensitive and high-risk changes (`${CLAUDE_PLUGIN_ROOT}/config/policies.yaml`); the state engine does not enforce it, the workflow does.
- Ticket drift before implementation: JIRA_CHANGED -> SPEC_REVIEW_REQUIRED -> reapproval; implementation blocked meanwhile.
- Validation completion (spec §14.3) precedes REVIEWING. Reviewers see only requirement, code and tests.
- Tests are black-box, written by `test-writer` from the approved specification; the implementer must not edit them.
- Merge is human-controlled. Production deployment is disabled.
- COMPLETED requires KNOWLEDGE_CONSOLIDATED then TEMPORARY_ARTIFACTS_CLEANED; temporary artifacts are deleted only by the consolidation workflow after validation and the consolidation commit.

## Implementation rules (spec §26)

Work only in task repositories on branch `<ticket>`; small reviewable changes traceable to the specification; run relevant tests incrementally; no unrelated cleanup, public-interface changes, or dependency upgrades unless the specification permits; never disable or delete tests to make CI pass; no architecture change without updating the specification or a decision record.
