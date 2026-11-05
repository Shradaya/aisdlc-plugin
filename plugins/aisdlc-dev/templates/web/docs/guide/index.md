# What is aisdlc

aisdlc is a Claude Code plugin plus a control-plane repository that turns a ticket into reviewed, tested, released code, and then into durable product knowledge. It does this with four ideas.

1. **Every task has a state.** A feature or bug lives in `tasks/<ticket-number>/task.yaml` and moves through a fixed [state machine](/guide/feature-lifecycle). The state, not Claude's mood, decides what is allowed.
2. **Humans approve at gates.** A feature cannot touch application source until its specification is [approved](/guide/approvals).
3. **Hooks enforce the rules.** Critical rules (no source edits before approval, branch must equal the ticket number, commit message format, no force push) are enforced by Claude Code hooks, so they hold even when an instruction is forgotten. You see these as [BLOCKED messages](/guide/blocked).
4. **Knowledge has provenance.** What aisdlc learns about your repositories is stored with the commit it was based on, a timestamp, a status and a confidence, so you can tell how far to trust it. That is what the [Repositories](/repos/) section of this site shows.

## The two ways in

The primary developer workflow is deliberately small:

```text
/aisdlc-dev:feature FEAT-1234
/aisdlc-dev:bug BUG-5678
```

Everything after that is driven by the task state. If you are interrupted, `/aisdlc-dev:resume <ticket-number>` picks up from the last valid state.

## What this site is

| Part | What you get |
|---|---|
| **Guide** (these pages) | Hand-written how-to material. |
| **Repositories** | Generated at build time from `repositories/<repo>/` for every repository in `config/repositories.yaml`. |
| **System** | Generated from `system/`: architecture, domains, decisions and product knowledge. |

Where each ticket stands is not on this site: `/aisdlc-dev:status-page` opens a separate live status page (every task's past, current and upcoming states, approvals, history and documents).

The site is **read-only**. It never changes the workspace, and it never reads `tasks/`, logs or credentials. To change anything, use the aisdlc commands in Claude Code.

## Reading order

1. [Getting started](/guide/getting-started)
2. [Command catalog](/guide/commands)
3. [Feature lifecycle](/guide/feature-lifecycle) and [Bug lifecycle](/guide/bug-lifecycle)
4. [Approval gates](/guide/approvals)
5. When something goes wrong: [Jira unavailable](/guide/jira-unavailable), [Being blocked](/guide/blocked), [Resume](/guide/resume)
6. [Post-release and finish](/guide/post-release-and-finish)
7. [FAQ](/guide/faq)
