---
name: investigate
description: Read-only investigation workflow for a ticket - understand the symptom, gather evidence, analyze, test hypotheses, produce findings. Never modifies source. Use only when the developer runs /aisdlc:investigate.
argument-hint: <ticket-number>
disable-model-invocation: true
---

# investigate

## Purpose
Produce evidence-based findings without changing code (spec §36). Lifecycle detail: `${CLAUDE_PLUGIN_ROOT}/workflows/investigation.md`.

## Invocation conditions
Explicit `/aisdlc:investigate <ticket-number>`. `$ARGUMENTS` = `<ticket-number>`.

## Inputs
Ticket matching `^[A-Z][A-Z0-9]*-\d+$`; repository knowledge; read-only access to registered repositories.

## Prerequisites
Valid ticket; no existing task for it (`node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` fails), else use `/aisdlc:resume`.

## Procedure
1. Retrieve the ticket (jira-ticket phase 1; fallback questions, never guess). `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js init <TICKET> investigation`; jira-ticket phase 2; `transition <TICKET> TICKET_READY`.
2. `transition <TICKET> UNDER_INVESTIGATION`. Record candidate repositories: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> repositories '["..."]'` (informational; source edits stay blocked for investigation tasks).
3. Understand the symptom; gather evidence; analyze the system; test hypotheses. Use read-only means only: reading files, `git -C <path> grep`, `git -C <path> show main:<file>`, `git log`; do not checkout, stash, branch or run commands that modify the working tree or any system. Running existing tests or queries is allowed only if read-only and non-production.
4. Write findings to `tasks/<TICKET>/findings.md`: symptom, evidence (with commit SHA and file/line references), hypotheses tested and outcome, conclusions with confidence, open questions, recommended next task type. Never include secrets.
5. Promotion: an investigation MUST NOT modify source unless explicitly converted into an implementation task. If the developer wants that, they start a new task (`/aisdlc:bug` or `/aisdlc:feature`, with their own ticket); this task stays read-only.
6. When findings are complete the developer runs `/aisdlc:finish <TICKET>`.

## Outputs
`tasks/<TICKET>/jira.md`, `tasks/<TICKET>/findings.md`.

## Failure behavior
Missing facts: ask. Evidence conflicts: record both and ask; do not guess. Use failure states with a reason via the CLI when blocked.

## Safety restrictions
Read-only. The hook blocks source edits for investigation tasks; do not try to bypass it. No production access. Never edit `task.yaml` directly.
