---
name: server
description: Link this workspace to the AISDLC server and manage it - login status, init --project (downloads this role's PM workspace files), record where things live. Use when the user runs /aisdlc-pm:server or asks to set up, link or check the AISDLC server.
argument-hint: init --server <url> --project <name> | status | whoami
---

# server

## Purpose
The AISDLC server holds every ticket, its phase, approvals and the project's knowledge. This workspace stays the working copy; `push` and `pull` sync it. As a PM this workspace downloads and may upload only the PM files (requirements and acceptance criteria per ticket, and the PM-writable `config/` and `system/product` knowledge). The AC approval is a human decision in the web UI and is never part of any command here.

## Procedure
1. Check the login: `node ${CLAUDE_PLUGIN_ROOT}/scripts/server/aisdlc-server.js whoami`. If it says "not logged in" or "expired", tell the user to run the login **in their own terminal** (the password must never pass through the chat): `! node ${CLAUDE_PLUGIN_ROOT}/scripts/server/aisdlc-server.js login --server <url>`. Never ask for, accept or type a password yourself.
2. Run the requested subcommand with `node ${CLAUDE_PLUGIN_ROOT}/scripts/server/aisdlc-server.js $ARGUMENTS`:
   - `init --server <url> --project <name> [--dry-run]`: run with `--dry-run` first, show the list, then run for real. It writes only the PM role's files; existing local edits are kept (a conflicting server copy is saved as `<file>.server`).
   - `status`: show how the workspace is linked.
3. Report what changed and the next step printed by the command.

## Safety restrictions
- Never print, read or copy the token or the credentials file (`%APPDATA%\aisdlc\credentials.json`); never set or echo `AISDLC_TOKEN` or `AISDLC_PASSWORD`.
- `claude.env`, `.env*`, `.mcp.json`, logs and credentials are never sent to the server.
- Jira credentials (`JIRA_EMAIL`, `JIRA_API_TOKEN`) are environment variables only; never read, print or store their values.
