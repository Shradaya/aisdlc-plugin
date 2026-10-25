# Database Change Workflow

Reference for `/aisdlc-dev:database-change` (spec §34). Procedure: `skills/database-change/SKILL.md` on top of `skills/feature/SKILL.md`. Task type `database-change` uses the `feature` lifecycle (`workflows/feature.md`).

## Flow

Ticket -> schema impact -> consumer analysis -> migration strategy -> backward compatibility -> specification -> approval -> migration implementation -> application changes -> migration tests -> rollback verification -> review.

## Must be documented (specification and plan)

- migration ordering;
- lock / availability impact;
- backward compatibility;
- rollback strategy;
- data transformation risks.

## Gates

- Specification approval, then plan approval (`${CLAUDE_PLUGIN_ROOT}/config/policies.yaml` `feature.require_plan_for_database_change`).
- Migration tests and rollback verification are required validation checks (`${CLAUDE_PLUGIN_ROOT}/config/testing-policy.yaml`).
- `database-reviewer` is a mandatory reviewer.
- No migration or write against production databases.
