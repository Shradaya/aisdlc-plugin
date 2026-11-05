# Dependency Upgrade Workflow

Reference for `/aisdlc-dev:dependency-upgrade`. Procedure: `skills/dependency-upgrade/SKILL.md` on top of `skills/feature/SKILL.md`. Task type `dependency-upgrade` uses the `feature` lifecycle (`workflows/feature.md`).

The specification does not define a dedicated dependency-upgrade flow beyond scope (§2), the rule "avoid dependency upgrades unless required by the task" (§26) and the command catalog (§51). This workflow therefore applies the feature lifecycle without extra stages:

- The specification names each dependency, current and target version, and why the ticket requires it. Unrelated upgrades are out of scope.
- Impact analysis covers dependents among registered repositories.
- Validation runs all mandatory test layers of each affected repository.
- `security-reviewer` participates in review.
- Same gates as the feature workflow (specification approval, source gate, commit convention, post-release consolidation).
