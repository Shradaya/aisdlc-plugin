---
name: init
description: "Set up an aisdlc PM workspace in a folder - config/, tasks/, logs/, CLAUDE.md, claude.env.example and .claude/settings.json where the PM drafts requirements and acceptance criteria. Use only when the PM runs /aisdlc-pm:init."
argument-hint: "[target-folder] [--from-dev [dev-ws]] [--dry-run] [--force]"
disable-model-invocation: true
---

# init

## Purpose
Turn a folder into an aisdlc **PM** workspace: where a project manager drafts `requirements.md` and `acceptance-criteria.md` under a ticket, and optionally writes them into the Jira description. Templates ship in `${CLAUDE_PLUGIN_ROOT}/templates`.

## Invocation conditions
Explicit `/aisdlc-pm:init [target-folder] [--from-dev [dev-ws]] [--dry-run] [--force]`. `$ARGUMENTS` = those options. The target defaults to the current folder.

> Shared repo: if `config/workspace.yaml` has `"kind": "aisdlc"`, the workspace is initialised by `/aisdlc:init`; do not scaffold it again. Nothing else to do here.

## Procedure
1. Run a preview: `node ${CLAUDE_PLUGIN_ROOT}/scripts/init/aisdlc-pm-init.js $ARGUMENTS --dry-run`.
2. Show what would be created, merged and skipped. If `--force` would overwrite files, confirm with AskUserQuestion first.
3. Run the same command without `--dry-run`.
4. `--from-dev [dev-ws]` is optional: it copies the Jira connection settings (base URL, auth scheme, AC field and the credential variable **names only**) from an aisdlc-dev workspace. It never reads `.env`/`claude.env`/`.mcp.json`, never copies a credential value, and never turns a `jira.write` switch on. Preview it first, show the planned changes, then run it.
5. Report the result and the next steps:
   - Set `jira.base_url` in `config/integrations.yaml`.
   - Set `JIRA_EMAIL` and `JIRA_API_TOKEN` as **environment variables only** (never in a file). Report them as set or missing by name; never print a value.
   - Check the connection with `node ${CLAUDE_PLUGIN_ROOT}/scripts/jira/jira-pm.js check`.
   - Turn on `jira.write.update_description` (and the AC-field switch) **only** when the token has the `write:issue:jira` scope, and only after reviewing a preview.
   - Restart Claude Code so the hooks load.

## What it creates
`config/{workspace.yaml (kind pm), repositories.yaml (the workspace marker), integrations.yaml (Jira, write switches off)}`, `CLAUDE.md`, `claude.env.example` (variable names only), `.claude/settings.json` (deny rules + enabled plugin), `tasks/.gitkeep`, `logs/.gitkeep`, `.gitignore`, and the `requirements.md`/`acceptance-criteria.md` skeletons under `templates/docs` for reference.

## Behavior
- Existing files are never overwritten unless `--force`.
- `.gitignore` and `.claude/settings.json` are merged (missing lines/rules appended); nothing is removed.
- `claude.env`, `.env`, `.mcp.json` and `node_modules` are never created.

## Failure behavior
Missing target folder or templates: the script exits with the reason and changes nothing.

## Safety restrictions
Writes only the files listed above under `<target>`. Never writes secrets, never reads or copies credential values, never turns a Jira write switch on.
