---
name: feature-specification
description: Generate tasks/<ticket>/specification.md from the approved analysis, run the human approval checkpoint, and handle changes, rejection and reapproval. Hard gate before implementation.
argument-hint: <ticket-number>
---

# feature-specification

## Purpose
Produce the mandatory specification and obtain explicit human approval before any source edit (spec §23, §24).

## Invocation conditions
Task state REPOSITORIES_PREPARED (feature lifecycle, including refactor, api-change, database-change, dependency-upgrade, documentation types); or SPEC_REVIEW_REQUIRED for reapproval. Not used for bugs (they use `root-cause.md`).

## Inputs
`jira.md`, `requirements.md`, `impact-analysis.md`, `knowledge-manifest.yaml`, listed knowledge files, `repository-preparation.yaml`; for UI features the pinned design in `system/designs/<DESIGN-TICKET>/` (added by `design-link` after the first draft).

## Prerequisites
`node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` shows REPOSITORIES_PREPARED (or SPEC_REVIEW_REQUIRED / WAITING_FOR_INPUT with `resume_state` REPOSITORIES_PREPARED).

## Procedure
1. Launch the `specification-writer` subagent with only: requirements, jira snapshot, impact analysis, manifest knowledge, and the output path.
2. The specification MUST follow the template (29 sections): Executive Summary; Problem Statement; Business Objective; Functional Requirements; Non-Functional Requirements; Scope (In Scope, Out of Scope); Assumptions; Open Questions; Current System Behavior; Proposed System Behavior; User / Consumer Flow; Architecture Changes; Repository Impact; API / Interface Changes; Database / Data Changes; Event / Messaging Changes; Security Considerations; Error Handling; Backward Compatibility; Performance Considerations; Observability; Testing Requirements; Deployment Considerations; Rollback / Recovery Strategy; Acceptance Criteria; Risks; Dependencies; Alternatives Considered; Decisions Required. Header: `# <TICKET> - <Title>`. Every section is reviewed; inapplicable ones state `Not applicable` and why.
3. Quality rules: describes behavior, not just files to edit; names affected repositories; separates requirements from assumptions and known facts from inferences; defines acceptance criteria; covers migration/rollback, security/operational impact, testing requirements. Open Questions that affect design are asked (AskUserQuestion) and resolved before approval.
4. Write `tasks/<TICKET>/specification.md`. Append audit `specification-created`; `set <TICKET> workflow.specification '"completed"'`.
5. (Shortened lifecycle: there are no separate SPEC_DRAFTED/AWAITING_SPEC_APPROVAL states — the task stays at REPOSITORIES_PREPARED until it reaches SPEC_APPROVED on approval.) If an affected repository has `"ui": true`, run the `design-link` skill now: it reads the authored design from the registered design repository, records a hashed snapshot under `system/designs/<DESIGN-TICKET>/`, adds the "Design references" subsection to section 11 and the design-linked acceptance criteria to section 25 (so the approval hash covers the pinned design version). Append audit `approval-requested`, then go to the approval checkpoint (step 6).
6. Show: feature, title, repositories, spec path, for UI features the design ticket, pinned version, source design repo + commit and snapshot hash, and "Implementation is BLOCKED until specification approval." Ask via AskUserQuestion with exactly: `Approve specification` / `Request changes` / `Reject task`.
   - Approve: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js approve <TICKET> specification` (records approver, spec hash, version), then `... transition <TICKET> SPEC_APPROVED`.
   - Request changes: collect the changes, revise `specification.md`, return to step 6. The CLI increments the version only when the approved hash changed.
   - Reject task: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js reject <TICKET> specification "<reason>"` then `... transition <TICKET> CANCELLED --reason "<reason>"`.
7. Change after approval: any material edit to an approved specification changes its hash; the hook blocks source edits until the developer reapproves (run step 6 again; the version increments). Material change to scope/behavior requires reapproval. Minor wording fixes still require re-running `approve`.
8. Reapproval after ticket drift (state SPEC_REVIEW_REQUIRED): revise the spec to the new ticket content, then step 6.

## Outputs
`tasks/<TICKET>/specification.md`; `approvals.specification` recorded by the CLI; state at SPEC_APPROVED.

## Failure behavior
If the developer does not answer or required details are missing: `transition <TICKET> WAITING_FOR_APPROVAL` (or WAITING_FOR_INPUT) with a reason, and stop. Never treat silence as approval.

## Safety restrictions
- Never call `approve` unless the developer explicitly chose "Approve specification" (or ran `/aisdlc-dev:approve`) in this session.
- Specification edits are task-artifact edits only; never edit application source here.
- Never edit `task.yaml` directly.
