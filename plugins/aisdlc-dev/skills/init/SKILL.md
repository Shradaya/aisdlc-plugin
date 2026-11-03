---
name: init
description: Set up an aisdlc workspace in a folder - the .claude/ config, web/ docs site, config/, repositories/, system/, tasks/ and logs/ where the plugin stores everything. Use only when the developer runs /aisdlc-dev:init.
argument-hint: [target-folder] [--only claude|web|workspace] [--migrate-jira [--remove-mcp]] [--dry-run] [--force]
disable-model-invocation: true
---

# init

## Purpose
Turn a folder into the single aisdlc workspace the plugin uses to store its knowledge and state across all repositories: registry, repository knowledge, system and product docs, tasks, audit logs and the docs site. Templates ship in `${CLAUDE_PLUGIN_ROOT}/templates`.

## Invocation conditions
Explicit `/aisdlc-dev:init [target-folder] [--only claude|web|workspace] [--dry-run] [--force]`. `$ARGUMENTS` = those options. The target defaults to the current folder.

## Procedure
1. Run a preview: `node ${CLAUDE_PLUGIN_ROOT}/scripts/init/aisdlc-init.js $ARGUMENTS --dry-run`.
2. Show what would be created, merged and skipped. If `--force` would overwrite files, confirm with AskUserQuestion first.
3. Run the same command without `--dry-run`.
4. Existing workspace still on the Jira MCP adapter (the script prints a `Jira:` line, or the session-start hook reported it):
   - Preview: `node ${CLAUDE_PLUGIN_ROOT}/scripts/init/aisdlc-init.js <target> --migrate-jira --dry-run`. Show the `changes`, `warnings` and `ca_certificate`, and confirm with AskUserQuestion. Then run it without `--dry-run`. It switches the adapter to `rest-api` and adds only missing Jira settings. It never changes values that are already set and never touches credentials.
   - Check: `node ${CLAUDE_PLUGIN_ROOT}/scripts/jira/jira-fetch.js check`. If `ca_certificate` was reported and the check fails with a certificate error, tell the developer to set `NODE_EXTRA_CA_CERTS` to that path and restart the session.
   - Only after the check passes, offer to remove the Jira MCP server: `... --migrate-jira --remove-mcp --dry-run`, confirm, then run it without `--dry-run`. It backs up `.mcp.json` to `.mcp.json.aisdlc-jira-backup` first, keeps any other servers, and deletes an old Jira-only `.mcp.json.example`. Tell the developer to restart Claude Code so the server is no longer loaded.
5. Report the result and the next steps: copy `claude.env.example` to `claude.env` and set `AISDLC_REPOS_ROOT` (paths only), run `cd web && npm install && npm run dev` (Node 20+) for the docs site, then `/aisdlc-dev:add-repo <name> <path>` for each repository.

## What it creates (parts)
- `claude`: `.claude/settings.json`, `.claude/rules/*.md`.
- `web`: `web/**`, the VitePress docs site (no `node_modules`).
- `workspace`: `config/{repositories,integrations,workspace}.yaml` (the registry starts empty), `repositories/`, `system/{architecture,product,decisions,designs}/`, `system/repository-relationships.yaml`, `tasks/`, `logs/`, `CLAUDE.md`, `claude.env.example`, `.gitignore`.

Once `config/repositories.yaml` exists the folder is an aisdlc workspace: hooks and CLIs resolve it from the folder itself, any subfolder, or `AISDLC_ROOT`. All plugin output (repository knowledge, system and product docs, task state, audit logs, web) is stored there, and the repositories it works on stay wherever they are cloned (registered by path through `claude.env`).

## Behavior
- Existing files are never overwritten unless `--force`. The one exception is `--migrate-jira`, which edits only the Jira parts of `config/integrations.yaml` and `config/workspace.yaml` (and of `.mcp.json` with `--remove-mcp`).
- `.claude/settings.json` is merged additively (permission entries and enabled plugins added, nothing removed); `.gitignore` gets missing lines appended.
- `.claude/settings.local.json`, `claude.env` and `node_modules` are never created.

## Failure behavior
Missing target folder or templates: the script exits with the reason and changes nothing.

## Safety restrictions
Writes only the files listed above under `<target>`. Never writes secrets, never touches `tasks/*/task.yaml` of an existing workspace, never runs `npm install` itself.
