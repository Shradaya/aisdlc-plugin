# API Change Workflow

Reference for `/aisdlc:api-change` (spec §33). Procedure: `skills/api-change/SKILL.md` on top of `skills/feature/SKILL.md`. Task type `api-change` uses the `feature` lifecycle (`workflows/feature.md`).

## Flow

Ticket -> impact analysis -> API contract identification -> backward compatibility analysis -> specification -> approval -> implementation -> consumer validation -> contract / integration tests -> review.

## Gates

- Known API consumers MUST be identified before modifying a breaking contract.
- Specification approval, then plan approval (`config/policies.yaml` `feature.require_plan_for_api_change`).
- Consumer validation and contract/integration tests are required validation checks.
- API compatibility is reviewed (backend-reviewer; security-reviewer where applicable).
