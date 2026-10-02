---
name: remove-repo
description: Unregister a repository from the aisdlc workspace. Use only when the developer runs /aisdlc:remove-repo.
argument-hint: <repo-name>
disable-model-invocation: true
---

# remove-repo

## Purpose
Remove a repository from the registry so tasks can no longer select it. The spec lists the command (§51) but does not define its behavior; this is the minimal safe interpretation.

## Invocation conditions
Explicit `/aisdlc:remove-repo <repo-name>`. `$ARGUMENTS` = `<repo-name>`.

## Inputs
`repo-name`.

## Prerequisites
- Registered in `config/repositories.yaml`.
- No active task lists it. For every `tasks/*/task.yaml`, run `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>`; a status other than COMPLETED/CANCELLED with the repository in `repositories` blocks removal.
- No other registered repository lists it in `depends_on` (warn and require explicit confirmation).

## Procedure
1. Verify prerequisites; stop and list blocking tasks or dependents.
2. Ask the developer to confirm (AskUserQuestion), and whether to keep or delete the `repositories/<repo-name>/` knowledge package.
3. Remove the entry from `config/repositories.yaml` (keep valid JSON-compatible YAML) and its edges from `system/repository-relationships.yaml`.
4. Delete `repositories/<repo-name>/` only if the developer chose deletion; otherwise leave it and set its `repository.yaml` status to `deprecated`.
5. Report what changed.

## Outputs
Updated registry and relationship data.

## Failure behavior
Any unmet prerequisite: change nothing and report why.

## Safety restrictions
Never touch the code repository. Never edit `tasks/*/task.yaml`.
