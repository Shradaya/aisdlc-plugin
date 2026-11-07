# Changelog

What changed in aisdlc-qa, newest first. Versions: **major** when people must act, **minor** for something new, **patch** for fixes. README, tests and docs-site changes need no version. Every behavior change to this plugin needs a bump here and in `.claude-plugin/plugin.json` (checked by `node scripts/version-check.js --base <ref>`).

## 1.1.0 (2026-11-08)
Works in the shared aisdlc repo: task state and audit log become `task.qa.yaml` and `execution-log.qa.jsonl`; QA reads the PM's `acceptance-criteria.md` instead of fetching Jira again; `init` adds only the local test scaffold and `config/environments.yaml` and leaves the shared files alone; tests, fixtures and Playwright files stay local and are never committed, only `tasks/<TICKET>/` is shared via `/aisdlc:push`. Standalone QA workspaces are unchanged. Approvals are held for the person's confirmation by the hook (approve and reject are always asked) and need a git user.email; execution logs are hash-chained and state files sealed (see `aisdlc-state.js audit` and `verify`; optional `AISDLC_LOG_KEY`), and the hooks block editing them by hand or trusting an edited state.

## 1.0.2 (2026-11-06)
Skill and agent descriptions no longer contain angle brackets (uploads reject them as XML tags) and are valid strict YAML.

## 1.0.1 (2026-11-06)
Generated documents are now required to be short and precise.

## 1.0.0 (2026-11-03)
Initial tracked version.
