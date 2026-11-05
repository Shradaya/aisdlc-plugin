---
name: comment
description: Publish a design version to its Jira ticket - upload the version's design files (prototype and generated code) as attachments and post one comment that lists and embeds them. Takes the ticket number and the version. Use when the designer runs /aisdlc-design:comment.
argument-hint: <design-ticket-number> <version>
disable-model-invocation: true
---

# comment

## Purpose
Share a design version with the team on the Jira ticket: upload the files for `designs/<DESIGN-TICKET>/` version `<version>` (the prototype and the generated code for that version) as Jira attachments, then post a single comment that lists them, embedding image previews and linking the code/markup files. The comment is a copy for reviewers; the source of truth stays in the design repository.

## Invocation conditions
Explicit `/aisdlc-design:comment <DESIGN-TICKET> <version>`. `$ARGUMENTS` = `<DESIGN-TICKET> <version>`. The ticket matches `^[A-Z][A-Z0-9]*-\d+$`; `<version>` is `v<N>` or `<N>` (e.g. `v2` or `2`). Run inside a design workspace.

## Prerequisites
- The version exists: `designs/<DESIGN-TICKET>/versions/v<N>/snapshot.md` is present (the design was drafted/approved at that version via `/aisdlc-design:codify`).
- Jira writes are enabled in `config/integrations.yaml`: `jira.write.add_attachment` and `jira.write.add_comment` are both `true`. If either is off, the script says exactly which to turn on; relay that and stop (do not edit integrations.yaml yourself).
- `JIRA_EMAIL` and `JIRA_API_TOKEN` are set in the environment (names only; never print values). Check with `node ${CLAUDE_PLUGIN_ROOT}/scripts/jira/jira-comment.js check`.

## Procedure
1. Normalize `<version>` to `v<N>` and confirm `designs/<DESIGN-TICKET>/versions/v<N>/` exists. If not, list the available versions and stop.
2. Decide which files to publish for this version:
   - the prototype: `designs/<DESIGN-TICKET>/prototype/` (the reviewable screens);
   - the generated code for this version, if present: `designs/<DESIGN-TICKET>/code/<framework>/v<N>/`;
   - the version snapshot `designs/<DESIGN-TICKET>/versions/v<N>/snapshot.md`.
   Only include files that exist; never include `claude.env`, `.env`, secrets, `node_modules`, or anything outside `designs/<DESIGN-TICKET>/`.
3. Write a short wiki-markup header to a temp file (e.g. `tasks/<DESIGN-TICKET>/comment-v<N>.wiki`): the ticket, the version, the code target, and a one-line summary of what changed (from the version's change log). The script appends the file list/embeds; you do not hand-write the file list.
4. Preview first: run with `--dry-run` and show the designer what would be uploaded and the comment preview:
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/jira/jira-comment.js post <DESIGN-TICKET> <wiki-file> <files...> --dry-run`
5. On the designer's confirmation (AskUserQuestion), run it for real (drop `--dry-run`). The script uploads the files (skipping any already uploaded for this ticket, by content hash), posts the comment, and records each attachment and the comment in `tasks/<DESIGN-TICKET>/task.yaml` (jira.attachments / jira.comments).
6. Report the comment URL the script returns, and remove the temp wiki file.

## Outputs
Jira attachments on `<DESIGN-TICKET>` and one comment (its URL returned). Records under `tasks/<DESIGN-TICKET>/task.yaml`; no change to the design files or task state.

## Failure behavior
Version folder missing: list available versions and stop. Writes disabled: report which `jira.write` flags to enable and stop. Credentials/site URL missing: the script exits 2 with the reason; relay it. Network/Jira error: report the script's message; nothing partial is left in task state beyond what actually uploaded (each upload is recorded as it succeeds, so a re-run skips what already landed).

## Safety restrictions
- Publishes only files under `designs/<DESIGN-TICKET>/` for the named version; never `claude.env`, `.env`, secrets, credentials, `node_modules`, or real patient data.
- Writes to Jira only when `jira.write.add_attachment` and `jira.write.add_comment` are both enabled; never turns those switches on itself.
- Never prints credential values; checks only whether they are set.
- Read/least-privilege toward Jira otherwise: this skill only attaches files and posts one comment; it does not transition the ticket or edit its fields.
