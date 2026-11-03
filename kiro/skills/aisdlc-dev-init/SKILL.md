---
name: aisdlc-dev-init
description: Set up an aisdlc dev workspace in a folder - .claude/ config, web/ docs site, config/, repositories/, system/, tasks/ and logs/. Use when the user wants to initialize an aisdlc developer workspace in Kiro.
---

# aisdlc dev init (Kiro)

Turn a folder into the aisdlc dev workspace that stores the registry, repository knowledge, system and product docs, tasks, and audit logs. See `aisdlc-lifecycle-reference` for the `AI_SDLC_PLUGIN_HOME` setup. Let `DEV=%AI_SDLC_PLUGIN_HOME%\plugins\aisdlc-dev`.

## Procedure
1. Confirm the target folder (default: the current workspace). Run a dry run:
   `node %DEV%\scripts\init\aisdlc-init.js <target> --dry-run`
2. Show what would be created, merged, and skipped. If `--force` would overwrite files, confirm with the user first.
3. Run the same command without `--dry-run`.
   - Existing workspace on the Jira MCP adapter (the output has a `Jira:` line): `node %DEV%\scripts\init\aisdlc-init.js <target> --migrate-jira --dry-run`, confirm, then run without `--dry-run`. Next, `node %DEV%\scripts\jira\jira-fetch.js check`. Once that passes, `--migrate-jira --remove-mcp` removes the Jira MCP server from `.mcp.json` (backed up to `.mcp.json.aisdlc-jira-backup` first; other servers are kept).
4. Report the result and next steps:
   - Copy `claude.env.example` to `claude.env` and set `AISDLC_REPOS_ROOT` (paths only).
   - `cd web && npm install && npm run dev` (Node 20+) for the docs site.
   - Register each repository with the `aisdlc-dev-add-repo` skill.

## What it creates
- `claude`: `.claude/settings.json`, `.claude/rules/*.md`.
- `web`: `web/**`, the VitePress docs site (no `node_modules`).
- `workspace`: `config/{repositories,integrations,workspace}.yaml` (registry starts empty), `repositories/`, `system/{architecture,product,decisions,designs}/`, `system/repository-relationships.yaml`, `tasks/`, `logs/`, `CLAUDE.md`, `claude.env.example`, `.gitignore`.

## Behavior
- Existing files are never overwritten unless `--force`; `.claude/settings.json` is merged additively; `.gitignore` is append-only; `claude.env` and `node_modules` are never created.

## Safety
Writes only under the target folder. Never writes secrets, never touches an existing workspace's `tasks/*/task.yaml`, never runs `npm install` itself.
