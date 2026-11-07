---
name: init
description: Set up the shared aisdlc repository that every role (pm, design, dev, qa) works in, and record your role. Run once per machine in the repository folder. Use only when the person runs /aisdlc:init.
argument-hint: "[target-folder] [--role pm|design|dev|qa] [--adopt] [--dry-run] [--force]"
disable-model-invocation: true
---

# init

## Purpose
Turn a folder into the shared aisdlc repository (tasks, designs, system knowledge, config) and record the person's role. After this, no role needs its own init, push or pull.

## Procedure
1. If the role is not in `$ARGUMENTS`, ask with AskUserQuestion: `pm` / `design` / `dev` / `qa`. Never guess.
2. Preview: `node ${CLAUDE_PLUGIN_ROOT}/scripts/init/aisdlc-init.js $ARGUMENTS --role <role> --dry-run`.
3. Show what would be created, merged and skipped. If `--force` would overwrite files, confirm first.
4. If the folder is an existing single-role workspace (it has `config/workspace.yaml` with another `kind`, or `tasks/*/task.yaml`), offer `--adopt`: it sets the kind to `aisdlc` and gives each task file the role suffix. Explain that, and run it only if the person agrees.
5. Run the same command without `--dry-run`.
6. Report the result and the next steps: make sure the folder is the shared git repository (clone it, or `git init` and add the remote), install the role's plugin, restart Claude Code so the hooks load, then `/aisdlc:pull`.

## What it creates
`config/{workspace,repositories,integrations}.yaml`, `tasks/`, `designs/`, `system/`, `repositories/`, `logs/`, `CLAUDE.md`, `.gitignore` (QA tests, env files, logs and `.aisdlc/` stay local), `.claude/settings.json`, and the local, uncommitted `.aisdlc/role`.

## Safety restrictions
Never overwrites existing files without `--force`. Writes no secrets. Never commits.
