---
name: publish
description: Attach a signed-off QA ticket's evidence to the Jira ticket - the HTML report and step screenshots as zips, a final screenshot per scenario and the failing-step screenshots - and post the results comment (verdict, environment and build, scenario results, defects fixed or waived). Use only when the QA engineer runs /aisdlc-qa:publish.
argument-hint: <ticket-number> [--with-media]
disable-model-invocation: true
---

# publish

## Purpose
Make the Jira ticket the long-term home of the QA evidence (the workspace's `tasks/` folder is temporary and not committed), once the QA has signed off the results.

## Invocation conditions
Explicit `/aisdlc-qa:publish <TICKET> [--with-media]`. The task is at RESULTS_SIGNED_OFF (or EVIDENCE_PUBLISHED, to publish again: files already uploaded are skipped). `--with-media` also includes traces (and videos, if the run was recorded with `--video`) in the report zip (large; Jira has an attachment size limit). The per-step screenshots are the standard proof; never expect a video.

## Inputs
`tasks/<TICKET>/results.md` (signed off), the final run's `tasks/<TICKET>/evidence/run-<N>/summary.json`, task state (`environment`, `defects`, `runs`, `approvals.signoff`), `config/integrations.yaml`.

## Prerequisites
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` shows `approvals.signoff.status` = `approved`. If not, stop and point to `/aisdlc-qa:test <TICKET>`.
- `jira.write.add_attachment` and `jira.write.add_comment` are true in `config/integrations.yaml`, `jira.base_url` is set, and `JIRA_EMAIL` / `JIRA_API_TOKEN` are set as environment variables (check with `node ${CLAUDE_PLUGIN_ROOT}/scripts/qa/cred-check.js JIRA_EMAIL JIRA_API_TOKEN`). The token needs the write scopes listed in `integrations.yaml`.

## Procedure
1. Confirm the state and the sign-off with `get`. Find the final run N (the run `results.md` names).
2. Drift check: re-fetch the ticket (`${CLAUDE_PLUGIN_ROOT}/skills/jira-ticket/SKILL.md`, drift check). If the requirements changed materially since the scenarios were approved: `transition <TICKET> JIRA_CHANGED --reason "<what changed>"`, then `transition <TICKET> SCENARIO_REVIEW_REQUIRED`, and stop; the scenarios must be revised and re-approved (`/aisdlc-qa:test <TICKET>`).
3. If Jira writes are disabled or credentials are missing: say exactly what to enable or set. Offer `Skip publishing` (the evidence stays local; `set <TICKET> jira.publish '"skipped"'`, then `/aisdlc-qa:commit <TICKET>` is allowed from RESULTS_SIGNED_OFF) or stop until it is configured.
4. Pack the evidence: `node ${CLAUDE_PLUGIN_ROOT}/scripts/qa/evidence-pack.js <TICKET> <N> [--with-media]`. It writes `tasks/<TICKET>/evidence/run-<N>/upload/` with `<TICKET>-run<N>-report.zip`, `<TICKET>-run<N>-screenshots.zip`, `<TICKET>-run<N>-S<n>-final.png` per scenario and `-failed.png` for scenarios that failed in that run.
5. Draft the results comment in Jira wiki markup, `tasks/<TICKET>/jira-results.txt`: heading `h3. QA results: <PASS|PASS WITH WAIVERS|FAIL>`, environment, build and run, signed off by and when, a table `||Scenario||AC||Result||Evidence||` (one row per scenario; embed final screenshots as `!<file>|thumbnail!` sparingly), a defect list with each defect's final status (fixed in build X / waived: reason), the attachment names, and how to reproduce locally (`npx playwright test --grep @<TICKET>`). No secrets, tokens, internal file paths or patient data.
6. Show the file list (with sizes) and the comment preview, then AskUserQuestion: `Publish to Jira` / `Edit first` / `Don't publish`.
7. Publish: `node ${CLAUDE_PLUGIN_ROOT}/scripts/jira/jira-attach.js attach <TICKET> <files...>` (already uploaded files are skipped and reported), then `node ${CLAUDE_PLUGIN_ROOT}/scripts/jira/jira-attach.js comment <TICKET> tasks/<TICKET>/jira-results.txt`. The script records uploads and the comment in task state. On exit 1/2 show the error and stop (nothing is retried blindly).
8. If `jira.write.status_transitions.verified` is configured, move the ticket with `node ${CLAUDE_PLUGIN_ROOT}/scripts/jira/jira-attach.js transition <TICKET> verified` (exactly the configured transition; if it is refused, report the `available` list and never pick another); otherwise never change the ticket status.
9. `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> EVIDENCE_PUBLISHED` (skip when already there). Append audit `evidence-published` (files, comment id). Next: `/aisdlc-qa:commit <TICKET>`.

## Outputs
Jira attachments and one results comment on `<TICKET>`; `jira.attachments` / `jira.comments` in task state; state EVIDENCE_PUBLISHED.

## Failure behavior
Not signed off, or `results.md` changed since sign-off: the hook blocks the upload; stop and point to `/aisdlc-qa:test <TICKET>` for a new sign-off. Upload or comment error: report the script's JSON error; do not retry with other tools or ad-hoc HTTP.

## Safety restrictions
- Upload only files from the run's `upload/` folder; never upload `.auth/`, `claude.env`, logs or task state.
- Only after the QA's explicit `Publish to Jira`; never change the ticket status except to an explicitly configured transition.
- Never print or paste credentials.
