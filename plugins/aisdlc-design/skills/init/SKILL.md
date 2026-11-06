---
name: init
description: "Set up an aisdlc design workspace in a folder - config/, designs/, logs/, CLAUDE.md and .gitignore - so /aisdlc-design:sync can write the prototype into it. Use only when the designer runs /aisdlc-design:init."
argument-hint: "[target-folder] [--dry-run] [--force]"
disable-model-invocation: true
---

# init

## Purpose
Turn a folder into an aisdlc **design** workspace: the design git repository where `/aisdlc-design:sync` writes the Claude Design prototype for developers to read. Templates ship in `${CLAUDE_PLUGIN_ROOT}/templates`.

## Invocation conditions
Explicit `/aisdlc-design:init [target-folder] [--dry-run] [--force]`. `$ARGUMENTS` = those options. The target defaults to the current folder.

## Procedure
1. Run a preview: `node ${CLAUDE_PLUGIN_ROOT}/scripts/init/aisdlc-design-init.js $ARGUMENTS --dry-run`.
2. Show what would be created, merged and skipped. If `--force` would overwrite files, confirm with AskUserQuestion first.
3. Run the same command without `--dry-run`.
4. Report the result and the next steps: make sure the folder is the design git repository (clone the existing one, or `git init` and add the remote), restart Claude Code in it so the hooks load, then run `/aisdlc-design:sync <artifact link>` for the baseline. The hook only allows commits that stage `designs/prototype/`, so commit the scaffolding itself (`config/`, `CLAUDE.md`, `.gitignore`) from a normal terminal, not through Claude.

## What it creates
`config/repositories.yaml` (the marker that makes it a workspace), `designs/`, `logs/`, `CLAUDE.md`, `.gitignore`.

## Behavior
- Existing files are never overwritten unless `--force`.
- `.gitignore` gets missing lines appended; nothing is removed.

## Failure behavior
Missing target folder or templates: the script exits with the reason and changes nothing.

## Safety restrictions
Writes only the files listed above under `<target>`. Never writes secrets.
