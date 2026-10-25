# FAQ

## Using aisdlc

### Do I have to run every command?

No. The primary workflow is `/aisdlc-dev:feature <ticket-number>` or `/aisdlc-dev:bug <ticket-number>`. The rest of the lifecycle is driven by the task state, and `/aisdlc-dev:resume` picks it up if you stop.

### Why was my edit refused?

A hook enforces the task state. Read the `Reason:` line in the BLOCKED message and see [Being blocked](/guide/blocked). Most often the specification has not been approved yet.

### Can I use a branch name like `feature/FEAT-1234`?

No. Branches are named exactly `<ticket-number>`: no prefix, suffix, user name, date or slug.

### What does aisdlc do to my working tree when a task starts?

For each affected repository it stashes local changes including untracked files (`aisdlc: <ticket-number> pre-task stash`), checks out `main`, fast-forwards from origin, and creates the ticket branch. The stash is never popped for you. If `main` cannot fast-forward, or the branch already exists without a task record, it stops.

### Does aisdlc change my repositories when I add them?

No. `/aisdlc-dev:add-repo` is read-only: it does not check out branches, stash, create branches, modify source or configuration, or commit.

### Can I skip the spec for a tiny change?

Features always need a specification approval. For defects use `/aisdlc-dev:bug`, which has no specification gate but still requires a confirmed root cause and regression coverage. For investigation without changes use `/aisdlc-dev:investigate`.

### Jira is down. Can I still work?

Yes. aisdlc asks you for the ticket details and marks the source as user-provided. See [When Jira is unavailable](/guide/jira-unavailable).

### Where do I find what a feature actually does after release?

In `system/product/`, kept current by `/aisdlc-dev:post-release`. Browse it under [System](/system/).

### Can I use bypass-permissions mode?

It is not the standard aisdlc mode. aisdlc relies on conservative permissions plus hook-enforced protection for the critical boundaries.

## This site

### Is the site read-only?

Yes. It is generated at build time and shows what exists. Nothing on the site changes the workspace.

### How do I update it?

Rebuild: `npm run build`, or restart `npm run dev` (both run the sync first). See the README in the `web/` folder.

### What is the provenance badge on repository pages?

It comes from `repository.yaml` and `metadata.json` in the repository's knowledge package:

| Field | Meaning |
|---|---|
| `analyzed_commit` | The commit of the source repository the knowledge describes. |
| `status` | The knowledge status: `observed`, `inferred`, `human-confirmed`, `deprecated` or `conflicted`. Inference is never promoted to `human-confirmed` without explicit human approval. |
| `confidence` | `high`, `medium` or `low`. |
| `analyzed_at` | When the analysis was done. |
| freshness | Computed at build time: `current`, `needs-refresh` (the package says so), `aged` (analyzed more than 30 days before the build), `no-knowledge-package` or `unknown`. |

### Why does a page say freshness is "current" but the code has changed?

The site only knows the commit the knowledge was based on and the date. It cannot see the repository's current HEAD. Run `/aisdlc-dev:status` or `/aisdlc-dev:refresh-repo <repo-name>` in Claude Code.

### Why is the Repositories section empty?

No repository is registered. Run `/aisdlc-dev:add-repo <repo-name> <repo-path>` and rebuild.

### Why did the build fail with "SECRET SCAN FAILED"?

The sync step scans every file it copies for secrets (AWS access keys, private key headers, `password`, `token` and `api_key` style assignments, and similar). It fails the build instead of publishing a possible secret. The message names the file and line but never prints the value. Remove the secret from the source file, rotate it if it was real, and rebuild. Secrets must never be placed in task artifacts or knowledge documents in the first place.

### What does the site read from the workspace?

Only `config/repositories.yaml`, `repositories/<repo>/*.md` plus `repository.yaml` and `metadata.json`, everything under `system/`, and the task **id, type and status** from `tasks/*/task.yaml`. It never reads other task artifacts, `logs/`, or credentials.
