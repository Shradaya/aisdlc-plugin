# When Jira is unavailable

Normally Jira is reached through an MCP/connector adapter. When you run `/aisdlc-dev:feature FEAT-1234` aisdlc first retrieves the ticket, stores a snapshot in `tasks/FEAT-1234/jira.md` and records the snapshot hash in `task.yaml`.

## What counts as unavailable

The integration is disconnected, credentials are missing, or the issue cannot be retrieved. Jira credentials come from the environment variables `JIRA_EMAIL` and `JIRA_API_TOKEN` (see [Credentials for Jira and Bitbucket](/guide/getting-started#credentials-for-jira-and-bitbucket)); if either is missing, aisdlc tells you which one to set and uses the questions below in the meantime.

## What aisdlc does instead

It **does not guess ticket details**. It asks you, with interactive questions, for everything it needs. The workflow then continues as normal once you have supplied the required details.

### For a feature

- Ticket number
- Title
- Problem / business requirement
- Functional requirements
- Acceptance criteria
- Known constraints
- Known dependencies or related tickets, if applicable

### For a bug

- Ticket number
- Title
- Problem description
- Expected behavior
- Actual behavior
- Reproduction steps
- Environment
- Acceptance / resolution criteria

## How it is recorded

The answers are written to `jira.md` with the source marked as user-provided:

```yaml
source:
  type: user-provided
  jira_available: false
```

User-supplied details are clearly distinguished from Jira-sourced details, so a reviewer can tell where each statement came from.

## What you should do

1. Answer the questions as precisely as you can. Vague answers produce a vague specification, and unknowns that materially affect the design must be resolved before specification.
2. Prefer pasting from the ticket over paraphrasing it.
3. If you can reconnect Jira, do so and run `/aisdlc-dev:resume FEAT-1234`; aisdlc re-checks the ticket before implementation.
4. Check `/aisdlc-dev:status`, which reports disconnected integrations.

## Ticket drift

If Jira becomes available later and the ticket changed materially after the specification was approved, the task moves to `JIRA_CHANGED` then `SPEC_REVIEW_REQUIRED`, and implementation is blocked until [reapproval](/guide/approvals).

## What about writing back to Jira?

Writes (add comment, add a link or PR reference, update a configured workflow status) are performed only through the connector, and only for transitions that have been explicitly configured. No generic transition mapping is assumed. Secrets are never copied into Jira comments.
