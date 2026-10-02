# Command catalog

All commands are namespaced with the plugin name. `<ticket-number>` is a ticket key such as `FEAT-1234` or `BUG-5678`.

## Repository commands

| Command | What it does |
|---|---|
| `/aisdlc:add-repo <repo-name> <repo-path>` | Onboard a repository: read-only study, knowledge package in `repositories/<repo-name>/`, registration in `config/repositories.yaml`, then questions about where the repository fits in the system and baseline product documentation in `system/product/`. |
| `/aisdlc:refresh-repo <repo-name>` | Update the knowledge package from the commits since the last analysis. Full study on structural change. |
| `/aisdlc:remove-repo <repo-name>` | Remove a repository from the registry. |
| `/aisdlc:status` | Registered repositories, knowledge freshness, active tasks and states, integrations, pending approvals, conflicts, non-compliant repositories. |

## Task commands

Each one creates a task directory `tasks/<ticket-number>/` and follows its own workflow.

| Command | Use it for |
|---|---|
| `/aisdlc:feature <ticket-number>` | New or changed product behavior. The primary workflow. See [feature lifecycle](/guide/feature-lifecycle). |
| `/aisdlc:bug <ticket-number>` | A defect. Root cause first, minimal fix, regression test. See [bug lifecycle](/guide/bug-lifecycle). |
| `/aisdlc:post-release <ticket-number \| * \| PREFIX-*>` | After production release: consolidate knowledge into `system/product/` and clean up temporary artifacts, for one ticket or for all eligible tickets (`*`, `FEAT-*`) in one run. See [post-release](/guide/post-release-and-finish). |
| `/aisdlc:refactor <ticket-number>` | Restructure code while preserving documented behavior. |
| `/aisdlc:investigate <ticket-number>` | Read-only investigation that produces findings. It does not modify source unless explicitly converted into an implementation task. |
| `/aisdlc:database-change <ticket-number>` | Schema and data changes, with migration ordering and rollback. |
| `/aisdlc:api-change <ticket-number>` | API and interface changes, with compatibility analysis. |
| `/aisdlc:dependency-upgrade <ticket-number>` | Dependency upgrades. |
| `/aisdlc:documentation <ticket-number>` | Documentation tasks. |

::: info Which lifecycle do the others use?
Bugs and investigations have their own state machines. The other task types use the feature state machine.
:::

## Gate and recovery commands

| Command | What it does |
|---|---|
| `/aisdlc:approve <ticket-number> <gate>` | Approve a gate, for example `/aisdlc:approve FEAT-1234 specification`. See [approval gates](/guide/approvals). |
| `/aisdlc:reject <ticket-number> <gate> <reason>` | Reject a gate with a reason. |
| `/aisdlc:resume <ticket-number>` | Continue an interrupted task from the first incomplete safe state. See [resume](/guide/resume). |
| `/aisdlc:commit <ticket-number>` | Commit through the commit skill: message `<ticket-number>: <changes summary>`, on branch `<ticket-number>`. |
| `/aisdlc:pr <ticket-number>` | Create the pull request(s) once implementation, tests, review and commit are done. |
| `/aisdlc:pr-review <repo-name> <pr-id-or-url>` | Review a Bitbucket pull request (yours or a teammate's) against its ticket, the repository's documented conventions and interfaces, and aisdlc rules. Writes an advisory review to `reviews/<repo-name>/pr-<id>.md`; never approves, merges or edits, and posts comments only if you ask. |
| `/aisdlc:finish <ticket-number>` | Finalize a task. For features it refuses unless the state is `TEMPORARY_ARTIFACTS_CLEANED`. It never deletes artifacts. |

## The usual sequence

```text
/aisdlc:feature FEAT-1234
... approve the specification, then development, tests, review, PR, CI, merge, release ...
/aisdlc:post-release FEAT-1234
/aisdlc:finish FEAT-1234
```

`/aisdlc:finish` is a finalization step, not a shortcut around release or knowledge consolidation. Deleting temporary artifacts belongs to `/aisdlc:post-release`, so that `finish` is a final verification point after cleanup.

## Conventions you will notice

- **Commit messages** are exactly `<ticket-number>: <changes summary>`, one line, no body. For example `FEAT-1234: Add scheduled report generation`.
- **Branches** are named exactly `<ticket-number>`: no prefix, suffix, user name or date.
- **Base branch** is always `main`, updated fast-forward only.
- **`task.yaml`** is changed only through the state script, never by hand.
