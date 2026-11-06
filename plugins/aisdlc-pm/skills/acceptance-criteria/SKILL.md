---
name: acceptance-criteria
description: Draft tasks/<TICKET>/acceptance-criteria.md as stable-numbered AC1..ACn (Given/When/Then) from the requirements. Use when the PM runs /aisdlc-pm:acceptance-criteria.
argument-hint: <TICKET>
disable-model-invocation: true
---

# acceptance-criteria

## Purpose
Draft `tasks/<TICKET>/acceptance-criteria.md`: observable, testable criteria numbered `AC1..ACn`, each `ACn: <title>` followed by Given / When / Then lines. The numbering is the contract QA uses to tag scenarios `@<TICKET>-AC<n>`, so it must stay stable.

## Invocation conditions
Explicit `/aisdlc-pm:acceptance-criteria <TICKET>`. Requires `tasks/<TICKET>/requirements.md` and local state `REQUIREMENT_GATHERING` (or `ACCEPTANCE_CRITERIA_DEFINED` when revising).

## Procedure
1. Read `tasks/<TICKET>/requirements.md`. If it is missing, stop and point to `/aisdlc-pm:requirements <TICKET>`.
2. Draft or revise `tasks/<TICKET>/acceptance-criteria.md`. Keep it short and precise: one behaviour per criterion, one line per Given/When/Then, only testable outcomes. Each criterion is:
   ```
   AC1: <short title>
   - Given <context>
   - When <action>
   - Then <observable result>
   ```
3. Numbering rules (never break these):
   - Numbers are stable. On a revision never renumber and never reuse a number.
   - New criteria get the next free number.
   - Removed criteria are marked `ACn: (withdrawn)` and kept in place; the number is never reused.
4. Show the numbered list and ask the PM to confirm with AskUserQuestion.
5. On confirmation: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> ACCEPTANCE_CRITERIA_DEFINED`.
6. Tell the PM the next steps: approve the gate with `/aisdlc-pm:approve <TICKET> acceptance_criteria` (a human decision), optionally `/aisdlc-pm:jira-sync <TICKET>`, then `/aisdlc-pm:handoff <TICKET> dev|design`.

## Safety restrictions
- Writes only `tasks/<TICKET>/acceptance-criteria.md`.
- Never says "approved" and never approves anything; the single AC approval is a human decision (`/aisdlc-pm:approve`).
- Keeps AC numbering stable across every revision.
