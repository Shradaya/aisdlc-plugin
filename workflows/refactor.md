# Refactor Workflow

Reference for `/aisdlc:refactor` (spec §37). Procedure: `skills/refactor/SKILL.md` on top of `skills/feature/SKILL.md`. Task type `refactor` uses the `feature` lifecycle (`workflows/feature.md`), including the specification gate.

## Rules

Refactors MUST preserve documented behavior unless a behavior change is explicitly part of the ticket (and then stated in the specification).

## Required

- Characterization of existing behavior (tests written by `test-writer` from the specification and documented behavior, before the code changes).
- Dependency / consumer analysis (impact analysis).
- Incremental plan in `implementation-plan.md` with validation checkpoints per step.
- Regression tests.
- Performance comparison where relevant, recorded in `validation.md`.

## Gates

Same as the feature workflow: specification approval before implementation, hook-enforced source gate, validation completion, independent review, commit convention, post-release consolidation before COMPLETED.
