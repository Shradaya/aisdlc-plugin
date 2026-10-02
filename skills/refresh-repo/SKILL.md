---
name: refresh-repo
description: Refresh the knowledge package of an already registered repository from the commits since the last analysis. Use when the developer runs /aisdlc:refresh-repo or when repository knowledge is reported stale.
argument-hint: <repo-name>
disable-model-invocation: true
---

# refresh-repo

## Purpose
Bring `repositories/<repo-name>/` up to date with the repository's current HEAD, updating only what changed (spec §15).

## Invocation conditions
Explicit `/aisdlc:refresh-repo <repo-name>`, or as the technical knowledge refresh stage after implementation (spec §49). `$ARGUMENTS` = `<repo-name>`.

## Inputs
`repo-name` registered in `config/repositories.yaml`; existing `repositories/<repo-name>/repository.yaml` and `metadata.json`.

## Prerequisites
Repository is registered and its path exists. If not registered, tell the developer to run `/aisdlc:add-repo`.

## Procedure
1. Read the previously analyzed commit from `metadata.json` / `repository.yaml`.
2. Determine current HEAD: `git -C <path> rev-parse HEAD`.
3. Changed files: `git -C <path> diff --name-status <analyzed>..HEAD`. If the analyzed commit is unknown or not an ancestor of HEAD, treat it as a structural change.
4. Classify changed areas (source, tests, build, infra, migrations, CI/CD, API definitions, dependencies, docs).
5. Map them to affected knowledge artifacts.
6. If any structural trigger is present, run the full study instead of a partial update: read `${CLAUDE_PLUGIN_ROOT}/skills/add-repo/SKILL.md` and follow steps 3-7. Triggers: build system change; framework migration; top-level source structure change; new or removed service; deployment architecture change; database technology change; API contract change; event contract change; dependency graph change involving another registered repository.
7. Otherwise update only the affected artifacts (use the same analyst subagents for their artifacts), keeping every claim evidenced.
8. Update provenance on every touched artifact, `metadata.json` and `repository.yaml` (new analyzed commit, timestamp, generator version, status `current`).
9. If interfaces or dependencies changed, update `system/repository-relationships.yaml`.
10. Report changed files, updated artifacts, whether a full study ran, and unknowns.

## Outputs
Updated files under `repositories/<repo-name>/`, optionally `system/repository-relationships.yaml`.

## Failure behavior
If git cannot compute the diff or HEAD, stop and report; leave existing knowledge untouched and do not mark it current.

## Safety restrictions
Read-only against the code repository: no checkout, stash, branch, or edits. Never write secret values.
