# Changelog

What changed in aisdlc-dev, newest first. Versions: **major** when people must act, **minor** for something new, **patch** for fixes. README, tests and docs-site changes need no version. Every behavior change to this plugin needs a bump here and in `.claude-plugin/plugin.json` (checked by `node scripts/version-check.js --base <ref>`).

## 4.0.0 (2026-11-13)
**Act on this:** `/aisdlc-dev:pr`, `/aisdlc-dev:pull-request` and `/aisdlc-dev:promote` are removed. Use
`/aisdlc-dev:create-pr <TICKET> [targets] [--draft]` for everything they did.
- `create-pr` is now the one pull-request command. It opens PRs from the task branch into each target in
  `pr_target_branches` (into `main` only when the developer names it as a target), resolves a conflicting target on the ticket's environment branch `<TICKET>-<env>`
  (formerly `promote`), and on a later run tracks CI and records MERGED/RELEASED (formerly `pull-request`). It asks once
  before anything is pushed.
- `bitbucket-pr.js create` adds the repository's default reviewers (minus the PR author, with one retry when Bitbucket
  rejects the author) and reports them; a token that can't read them still creates the PR and reports
  `reviewers_error`.
- The feature and bug workflows, next-step hints, hook comments, docs and the Kiro copies point to `create-pr`.
- `pr-comments` reads `pull_requests.<repo>@<target>` and points to `create-pr` (an environment-branch PR gets a fix by
  re-running it).
- PR descriptions no longer carry HTML comments (Bitbucket shows them as text).
- New `bitbucket-pr.js decline-pr <pr-id>` (in the repository folder) or `decline-pr <repo-name|repo-path> <pr-id>`: declines
  an open PR, reports an already declined one, refuses a merged one. `create-pr` uses it only when the developer
  explicitly asks to decline or replace one of the ticket's PRs, confirms each PR, and records
  `declined_pull_requests` and a `pr-declined` audit event. `pr-review` still never declines.

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
