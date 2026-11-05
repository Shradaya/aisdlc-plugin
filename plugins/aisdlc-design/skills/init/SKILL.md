---
name: init
description: Set up an aisdlc design workspace in a folder - config/, designs/, design-system/, tasks/, logs/, CLAUDE.md and the preview/ web app where the designer authors and previews prototypes. Use only when the designer runs /aisdlc-design:init.
argument-hint: [target-folder] [--only workspace|preview] [--dry-run] [--force]
disable-model-invocation: true
---

# init

## Purpose
Turn a folder into an aisdlc **design** workspace: the folder where a UI/UX designer authors prototypes under design tickets, previews them by ticket number, and commits them for developers to consume. Templates ship in `${CLAUDE_PLUGIN_ROOT}/templates`.

## Invocation conditions
Explicit `/aisdlc-design:init [target-folder] [--only workspace|preview] [--dry-run] [--force]`. `$ARGUMENTS` = those options. The target defaults to the current folder.

## Procedure
1. Run a preview: `node ${CLAUDE_PLUGIN_ROOT}/scripts/init/aisdlc-design-init.js $ARGUMENTS --dry-run`.
2. Show what would be created, merged and skipped. If `--force` would overwrite files, confirm with AskUserQuestion first.
3. Run the same command without `--dry-run`.
4. Report the result and the next steps: run `cd preview && npm install && npm run dev` (Node 20+) for the preview app, fill in `design-system/{tokens,components,patterns}.md`, optionally set `AISDLC_DESIGN_SYSTEM` (and `AISDLC_DESIGN_SYSTEM_URL`) in `claude.env` to author against a Claude Design design system, then `/aisdlc-design:design <DESIGN-TICKET>` to author a prototype.

## What it creates (parts)
- `workspace`: `config/repositories.yaml` (the marker that makes it a workspace), `design-system/{tokens,components,patterns}.md`, `designs/`, `tasks/`, `logs/`, `CLAUDE.md`, `claude.env.example`, `.gitignore`.
- `preview`: `preview/**`, a minimal Vite app that renders each `designs/<DESIGN-TICKET>/prototype/` in a sandboxed iframe, selectable by ticket number (and screen for multi-screen prototypes), with live refresh (no `node_modules`).

## Behavior
- Existing files are never overwritten unless `--force`.
- `.gitignore` gets missing lines appended; nothing is removed.
- `claude.env` and `node_modules` are never created.

## Failure behavior
Missing target folder or templates: the script exits with the reason and changes nothing.

## Safety restrictions
Writes only the files listed above under `<target>`. Never writes secrets, never runs `npm install` itself.
