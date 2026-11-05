---
name: server
description: Link this workspace to the AISDLC server and manage it - login status, init --project (downloads this role's workspace files), choose repositories, record local clone paths. Use when the user runs /aisdlc-qa:server or asks to set up, link or check the AISDLC server.
argument-hint: init --server <url> --project <name> [--repos a,b] | status | repos | add-repos <a,b> | resolve-repo-path <repo> <path> | whoami
---

# server

## Purpose
The AISDLC server holds every ticket, its phase, approvals, designs and the project's knowledge. This workspace stays the working copy; `push` and `pull` sync it. What the workspace downloads and may upload depends on the user's role on the server (Admin, Development, Quality Assurance, Project Manager, Designer).

## Procedure
1. Check the login: `node ${CLAUDE_PLUGIN_ROOT}/scripts/server/aisdlc-server.js whoami`. If it says "not logged in" or "expired", tell the user to run the login **in their own terminal** (the password must never pass through the chat): `! node ${CLAUDE_PLUGIN_ROOT}/scripts/server/aisdlc-server.js login --server <url>`. Never ask for, accept or type a password yourself.
2. Run the requested subcommand with `node ${CLAUDE_PLUGIN_ROOT}/scripts/server/aisdlc-server.js $ARGUMENTS`:
   - `init --server <url> --project <name> [--repos a,b] [--dry-run]`: run with `--dry-run` first, show the list, then run for real. It writes only this role's files; existing local edits are kept (a conflicting server copy is saved as `<file>.server`).
   - `repos` / `add-repos <a,b>`: list and download repository knowledge (Development only). Only fetch the repositories the user works on.
   - `resolve-repo-path <repo> <path>`: records where a clone lives in `claude.env` (local only, never pushed).
   - `status`: show how the workspace is linked.
3. Report what changed and the next step printed by the command.

## Safety restrictions
- Never print, read or copy the token or the credentials file (`%APPDATA%\aisdlc\credentials.json`); never set or echo `AISDLC_TOKEN` or `AISDLC_PASSWORD`.
- `claude.env`, `.env*`, `.mcp.json`, logs and code clones are never sent to the server.
