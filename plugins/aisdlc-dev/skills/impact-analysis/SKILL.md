---
name: impact-analysis
description: Build the task knowledge manifest and produce tasks/<ticket>/impact-analysis.md identifying domains and directly/indirectly affected repositories with evidence. Mandatory before implementation.
argument-hint: <ticket-number>
---

# impact-analysis

## Purpose
Determine the change surface across registered repositories before any source change (spec §16, §21.3, §32). The system MUST NOT modify a repository merely because it is registered.

## Invocation conditions
After the requirement is understood (state UNDERSTOOD) in feature-lifecycle tasks; for bugs after root cause is confirmed (state ROOT_CAUSE_CONFIRMED).

## Inputs
`tasks/<TICKET>/jira.md`, `tasks/<TICKET>/requirements.md` (and `root-cause.md` for bugs), `config/repositories.yaml`, `system/repository-relationships.yaml`, repository knowledge packages.

## Prerequisites
- Task state is UNDERSTOOD (feature lifecycle) or ROOT_CAUSE_CONFIRMED (bug): `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>`.
- At least one registered repository.

## Procedure
1. Select knowledge (do not load the whole workspace): task type + Jira content + domains + repository graph + changed interfaces + file paths = manifest. Get the repository graph from the CLI, not by reading the relationships file: for each candidate repository run `node ${CLAUDE_PLUGIN_ROOT}/scripts/graph/aisdlc-graph.js impact <repo> --depth 2` (add `--min-status human-confirmed` to exclude inferred edges). Direct neighbours are direct/indirect candidates, 2-hop nodes are indirect candidates, external nodes are noted as unregistered consumers. Open `system/repository-relationships.yaml` only for the full description or evidence of a specific edge you cite. Write `tasks/<TICKET>/knowledge-manifest.yaml` (shape per spec §16: `task`, `repositories`, `knowledge` file list), prioritizing small, directly relevant artifacts.
2. If a candidate repository's knowledge is stale (analyzed commit != HEAD) or missing, tell the developer and recommend `/aisdlc-dev:refresh-repo` / `/aisdlc-dev:add-repo`; do not silently rely on stale knowledge.
3. Launch the `impact-analyst` subagent with only: requirements, the manifest and the listed knowledge files, and the output path.
4. Verify the result has every section of the spec §32 template: Ticket Summary, Affected Domains, Directly Affected Repositories, Indirectly Affected Repositories, Repositories Reviewed and Excluded, APIs / Interfaces, Database / Data, Events / Messaging, Infrastructure, Security, Testing, Documentation, Deployment, Evidence. Every repository entry has: repository, impact classification (direct | indirect | excluded), reason, evidence, confidence, required change (yes/no). Logical shape: `${CLAUDE_PLUGIN_ROOT}/config/schemas/impact-analysis.schema.yaml`.
5. Record domains: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> domains '["..."]'`.
6. `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> IMPACT_ANALYZED` (feature lifecycle only; bugs have no such state). Append audit event `impact-analysis-complete`; `set <TICKET> workflow.impact_analysis '"completed"'`.
7. Confirm affected repositories with the developer (AskUserQuestion, listing each repository with reason). Repositories with `base_branch != main` are non-compliant and cannot be selected until remediated.
8. Persist the confirmed list: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> repositories '["backend","database"]'` and append `repo-selected` events.
9. `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> REPOSITORIES_IDENTIFIED`.

## Outputs
`tasks/<TICKET>/knowledge-manifest.yaml`, `tasks/<TICKET>/impact-analysis.md`; `domains`, `repositories` and state updated via the CLI.

## Failure behavior
Unresolved conflicts between authoritative sources: `transition <TICKET> CONFLICTED --reason "..."` and ask the developer; do not guess. Unknowns that affect scope: ask. If no repository is affected, report that and stop for developer direction.

## Safety restrictions
Read-only against code repositories. Writes only task artifacts. Never edit `task.yaml` directly.
