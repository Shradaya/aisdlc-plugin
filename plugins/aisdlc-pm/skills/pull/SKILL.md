---
name: pull
description: Fetch from the AISDLC server - pull <TICKET> downloads that ticket's files for the PM (for example the acceptance criteria, design and specification) and its phase; pull plugin refreshes the workspace knowledge files. Use when the user runs /aisdlc-pm:pull or asks to get, fetch or update from the server.
argument-hint: <TICKET> | plugin  [--dry-run]
---

# pull

## Procedure
1. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/server/aisdlc-server.js pull $ARGUMENTS`.
2. Report the phase, which files were updated, and any `CONFLICT`: the local file was kept and the server version saved next to it as `<file>.server`; help the user merge it, then delete the `.server` copy.
3. `tasks/<TICKET>/server-ticket.json` holds the server's view (phase, gates incl. `acceptance_criteria`, allowed next phases); read it instead of guessing the ticket state. The mirror guard and `jira-sync` read this file, so a fresh `pull` before a hand-off or a Jira write keeps them honest.
4. After `pull plugin`, re-check `config/integrations.yaml`: a pulled copy can carry another PM's `jira.write.*` switches. Confirm the write switches are what you intend before any `jira-sync` apply.
5. If the command notes there is no local task record yet, offer to start the PM workflow for the ticket with `/aisdlc-pm:requirements <TICKET>`.
