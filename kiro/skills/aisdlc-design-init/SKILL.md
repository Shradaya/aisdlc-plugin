---
name: aisdlc-design-init
description: Set up an aisdlc design workspace in a folder (config/, designs/, design-system/, tasks/, logs/, and the preview/ web app). Use when the user wants to initialize an aisdlc design workspace in Kiro.
---

# aisdlc design init (Kiro)

Turn a folder into an aisdlc **design** workspace: where a UI/UX designer authors prototypes under design tickets, previews them by ticket number, and commits them for developers to consume. See `aisdlc-lifecycle-reference` for conventions and the `AI_SDLC_PLUGIN_HOME` setup.

## Procedure

1. Confirm the target folder with the user (default: the current workspace). Then run a dry run:
   `node %AI_SDLC_PLUGIN_HOME%\plugins\aisdlc-design\scripts\init\aisdlc-design-init.js <target> --dry-run`
2. Show what would be created, merged, and skipped. If `--force` would overwrite files, confirm with the user first.
3. Run the same command without `--dry-run`.
4. Report the result and the next steps:
   - `cd preview && npm install && npm run dev` (Node 20+) for the preview app.
   - Fill in `design-system/{tokens,components,patterns}.md`.
   - Optionally set `AISDLC_DESIGN_SYSTEM` (and `AISDLC_DESIGN_SYSTEM_URL`) in `claude.env` to author against a Claude Design design system.
   - Then run the `aisdlc-design-design` skill for a ticket.

## What it creates

- `workspace`: `config/repositories.yaml` (the marker that makes it a workspace), `design-system/{tokens,components,patterns}.md`, `designs/`, `tasks/`, `logs/`, `CLAUDE.md`, `claude.env.example`, `.gitignore`.
- `preview`: `preview/**`, a minimal Vite app that renders each `designs/<DESIGN-TICKET>/prototype/` in a sandboxed iframe, selectable by ticket number, with a ticket-state progress bar. No `node_modules`.

## Safety

- Existing files are never overwritten unless `--force`; `.gitignore` is append-only; `claude.env` and `node_modules` are never created.
- Writes only under the target folder. Never writes secrets, never runs `npm install` itself.
