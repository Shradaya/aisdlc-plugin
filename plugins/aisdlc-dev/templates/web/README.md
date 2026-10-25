# aisdlc web

A **read-only** documentation site for aisdlc, built with [VitePress](https://vitepress.dev). One site, two parts:

- **How to use aisdlc**: hand-written pages in `docs/guide/` (setup, command catalog, feature and bug lifecycles, approval gates, Jira fallback, BLOCKED messages, resume, post-release and finish, FAQ).
- **Repository documentation browser**: generated at build time from the workspace above `web/` by `scripts/sync.mjs`:
  - `docs/repos/<repo>/` from `repositories/<repo>/*.md`, `repository.yaml` and `metadata.json` for every repository in `config/repositories.yaml`, each page with a provenance badge (analyzed commit, status, confidence, analyzed at) and a freshness note.
  - `docs/system/` from `system/**` (architecture, domains, decisions, integrations, data flows) and `system/product/**`, with `feature-catalog.yaml` rendered as a table.
  - `docs/status.md`, a mirror of `/aisdlc-dev:status`: repositories and freshness, active tasks (id, type, status only), pending approvals, blocking issues.
  - `.vitepress/generated-nav.json`: the nav and sidebars, built from what exists.

With zero registered repositories the site still builds, and the Repositories page explains `/aisdlc-dev:add-repo`.

## Run it

Requires Node 20+ (developed on Node 24 / npm 11).

```bash
cd web
npm install

npm run dev       # sync, then VitePress dev server (http://localhost:5173)
npm run build     # sync, then static build into .vitepress/dist
npm run preview   # serve the built site
npm run sync      # only regenerate docs/repos, docs/system, docs/status.md and the nav
```

The sync runs on every `dev` and `build`. While `dev` is running, re-run `npm run sync` to pick up new repositories or knowledge changes; the dev server hot-reloads the generated pages.

## Safety

`scripts/sync.mjs` is deliberately narrow.

- It reads only `config/repositories.yaml`, `repositories/<repo>/` (`*.md`, `repository.yaml`, `metadata.json`), `system/**`, and from `tasks/*/task.yaml` **only** the `id`, `type` and `status` fields. Every read goes through one guarded function with an allow-list.
- It never reads `logs/`, `credentials/`, `secrets/`, `.git/`, `.env*` or private key files, and never any other task artifact.
- Before writing anything it runs a **secret scan** over everything it read and everything it generated: AWS access key ids and secret keys, private key headers, JWTs, GitHub and Slack tokens, Google API keys, bearer tokens, credentials embedded in URLs, and `password` / `token` / `api_key` / `secret` assignments. A match **fails the build** (exit code 1), nothing is generated, and the matched value is never printed, only file, line and rule.
  - Clearly placeholder values (`<token>`, `${TOKEN}`, `REDACTED`, `xxxx`, `changeme`, ...) are ignored. Unquoted `key: word` prose needs a digit or symbol to count. If you hit a false positive, reword the source.
- Copied Markdown is sanitized so `{{ }}` and stray `<tags>` cannot break the Vue compiler.
- The site is static and read-only. It writes nothing outside `web/`.

## Layout

```text
web/
  scripts/sync.mjs            build-time generator and secret scan
  docs/
    index.md                  home
    guide/*.md                hand-written guide
    repos/ system/ status.md  GENERATED (git-ignored)
  .vitepress/
    config.mts                site config; merges generated-nav.json
    generated-nav.json        GENERATED (git-ignored)
    theme/                    StateFlow diagram component, provenance badge styles
```

## Freshness

Freshness is computed at build time from `repository.yaml` / `metadata.json`: `current`, `needs-refresh` (the package says so), `aged` (analyzed more than 30 days before the build), `no-knowledge-package`, or `unknown`. The site cannot see the source repository's HEAD, so run `/aisdlc-dev:status` or `/aisdlc-dev:refresh-repo <repo-name>` in Claude Code for the authoritative answer. Change `STALE_AFTER_DAYS` in `scripts/sync.mjs` to tune the threshold.

## Provenance fields

The sync looks for `analyzed_commit`, `analyzed_at`, `status` (or `knowledge_status`), `confidence` and `generator_version` at the top level of `metadata.json` / `repository.yaml`, and under a `repository`, `provenance`, `knowledge` or `analysis` key. `metadata.json` takes precedence. Missing fields are shown as "not recorded".
