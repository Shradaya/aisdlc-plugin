# Changelog

What changed in aisdlc-dev, newest first. Versions: **major** when people must act, **minor** for something new, **patch** for fixes. README, tests and docs-site changes need no version. Every behavior change to this plugin needs a bump here and in `.claude-plugin/plugin.json` (checked by `node scripts/version-check.js --base <ref>`).

## 2.0.0 (2026-11-13)
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
- PR descriptions no longer carry HTML comments (Bitbucket shows them as text).
- New `bitbucket-pr.js decline-pr <pr-id>` (in the repository folder) or `decline-pr <repo-name|repo-path> <pr-id>`: declines
  an open PR, reports an already declined one, refuses a merged one. `create-pr` uses it only when the developer
  explicitly asks to decline or replace one of the ticket's PRs, confirms each PR, and records
  `declined_pull_requests` and a `pr-declined` audit event. `pr-review` still never declines.

## 1.0.0 (2026-11-03)
Initial tracked version.
