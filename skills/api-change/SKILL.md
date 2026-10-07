---
name: api-change
description: API change workflow for a ticket - contract identification, backward compatibility, consumer validation, contract and integration tests. Use only when the developer runs /aisdlc:api-change.
argument-hint: <ticket-number>
disable-model-invocation: true
---

# api-change

## Purpose
Controlled API contract changes under the specification and plan gates (spec §33). Details: `${CLAUDE_PLUGIN_ROOT}/workflows/api-change.md`.

## Invocation conditions
Explicit `/aisdlc:api-change <ticket-number>`. `$ARGUMENTS` = `<ticket-number>`.

## Inputs / Prerequisites
Same as the feature skill. `api-change` maps to the feature lifecycle.

## Procedure
Read `${CLAUDE_PLUGIN_ROOT}/skills/feature/SKILL.md` and `${CLAUDE_PLUGIN_ROOT}/workflows/api-change.md`, then execute the feature procedure with `TASK_TYPE=api-change` (`node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js init <TICKET> api-change`), adding:
1. Identify the API contract(s) (route, method, auth, request/response schemas, error behavior) from `repositories/<repo>/interfaces.md` and the repository.
2. Backward-compatibility analysis in the specification (section 19). Known API consumers MUST be identified before modifying a breaking contract (impact analysis; list them with `node ${CLAUDE_PLUGIN_ROOT}/scripts/graph/aisdlc-graph.js neighbors <repo>`, kinds `api`, `event`, `database`; evidence in `system/repository-relationships.yaml`).
3. Plan approval is required (`policies.yaml` `feature.require_plan_for_api_change`): `approve <TICKET> plan` only after an explicit developer choice.
4. Validation includes consumer validation and contract/integration tests (testing skill, cross-repository stage).
5. Review includes API compatibility via `backend-reviewer` (and `security-reviewer` where applicable).

## Outputs
As the feature skill.

## Failure behavior
Unidentified consumers of a breaking change block specification approval; ask the developer.

## Safety restrictions
All feature-skill restrictions apply. Do not change public interfaces beyond what the approved specification permits.
