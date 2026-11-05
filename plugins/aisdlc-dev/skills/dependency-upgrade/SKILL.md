---
name: dependency-upgrade
description: Dependency upgrade workflow for a ticket under the specification gate. Use only when the developer runs /aisdlc-dev:dependency-upgrade.
argument-hint: <ticket-number>
disable-model-invocation: true
---

# dependency-upgrade

## Purpose
Upgrade dependencies only when a ticket requires it (spec §2, §26), under the full gates. The spec defines no dedicated dependency-upgrade lifecycle; the state engine maps it to the feature lifecycle. Details: `${CLAUDE_PLUGIN_ROOT}/workflows/dependency-upgrade.md`.

## Invocation conditions
Explicit `/aisdlc-dev:dependency-upgrade <ticket-number>`. `$ARGUMENTS` = `<ticket-number>`.

## Inputs / Prerequisites
Same as the feature skill; `repositories/<repo>/dependencies.md` for current dependency classification.

## Procedure
Read `${CLAUDE_PLUGIN_ROOT}/skills/feature/SKILL.md` and `${CLAUDE_PLUGIN_ROOT}/workflows/dependency-upgrade.md`, then execute the feature procedure with `TASK_TYPE=dependency-upgrade` (`node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js init <TICKET> dependency-upgrade`), adding:
1. The specification names each dependency, current and target version, and the reason the ticket requires it; unrelated upgrades are out of scope.
2. Impact analysis covers dependents among registered repositories (shared libraries, generated clients).
3. Validation runs every mandatory test layer of each affected repository; security review via `security-reviewer`.

## Outputs
As the feature skill.

## Failure behavior
If an upgrade needs code changes beyond the specification, stop and request spec reapproval.

## Safety restrictions
All feature-skill restrictions apply. No upgrades beyond those authorized by the approved specification.
