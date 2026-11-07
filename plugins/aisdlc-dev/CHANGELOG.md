# Changelog

What changed in aisdlc-dev, newest first. Versions: **major** when people must act, **minor** for something new, **patch** for fixes. README, tests and docs-site changes need no version. Every behavior change to this plugin needs a bump here and in `.claude-plugin/plugin.json` (checked by `node scripts/version-check.js --base <ref>`).

## 4.0.0 (2026-11-08)

- **Plan approval is required for every feature.** The state engine refuses `IMPLEMENTING` until `approve <ticket> plan` is done, and `SPEC_APPROVED` no longer skips to `IMPLEMENTING`. Bug fixes have no plan gate (a mini-plan only when needed).
- In the shared repo a bug fix skips PM, design, specification and plan, and goes from dev straight to QA (`/aisdlc:handoff <TICKET> qa` after `finish`); the status page shows its own shorter steps.
- Shared repo cleanup (post-release) deletes only dev's own files, and the hook blocks deleting the PM's `jira.md`, `requirements.md` and `acceptance-criteria.md`.
- The Kiro port and its tests are removed.

## 3.1.0 (2026-11-08)
Works in the shared aisdlc repo: task state and audit log become `task.dev.yaml` and `execution-log.dev.jsonl`; `jira-ticket` reads the PM's `requirements.md` and `acceptance-criteria.md` after a hand-off instead of fetching Jira; `design-link` reads `designs/<TICKET>/` from the same repository. The commit rules apply to other repositories, while commits at the shared repo root belong to the aisdlc plugin. Standalone workspaces are unchanged. Approvals are held for the person's confirmation by the hook (approve and reject are always asked) and need a git user.email; execution logs are hash-chained and state files sealed (see `aisdlc-state.js audit` and `verify`; optional `AISDLC_LOG_KEY`), and the hooks block editing them by hand or trusting an edited state.

## 3.0.0 (2026-11-07)
Breaking: `design-link` reads the ticket's `designs/<TICKET>/` folder (synced by `/aisdlc-design:sync`) at `origin/main` or a ref the developer names, instead of tagged pages of `designs/prototype/` on a ticket branch, and pins the source commit sha. Nothing used 2.0.0.

## 2.0.0 (2026-11-06)
Breaking: `design-link` now reads the living prototype that `/aisdlc-design:sync` keeps in `designs/prototype/` of the design repository. It reads the ticket's pages (tagged in `pages.yaml`) at the ticket's branch, else `main`, and pins the snapshot and the source commit sha. The design key is the feature ticket itself, so `feature` no longer asks for a separate design ticket number, and the old `designs/<DESIGN-TICKET>/` layout is no longer read.

## 1.1.1 (2026-11-06)
Skill and agent descriptions no longer contain angle brackets (uploads reject them as XML tags) and are valid strict YAML.

## 1.1.0 (2026-11-06)
New `/aisdlc-dev:pr-comments`: reads the review comments on a task's pull request, triages them with the developer, fixes the valid ones under the normal rules, asks before committing and pushing, then replies. Generated documents are now required to be short and precise. The Bitbucket helper gains `comments` (read) and `comment --parent` (reply).

## 1.0.0 (2026-11-03)
Initial tracked version.
