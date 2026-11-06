# Changelog

What changed in aisdlc-pm, newest first. Versions: **major** when people must act, **minor** for something new, **patch** for fixes. README, tests and docs-site changes need no version. Every behavior change to this plugin needs a bump here and in `.claude-plugin/plugin.json` (checked by `node scripts/version-check.js --base <ref>`).

## 1.0.2 (2026-11-06)
Skill and agent descriptions no longer contain angle brackets (uploads reject them as XML tags) and are valid strict YAML.

## 1.0.1 (2026-11-06)
Generated documents are now required to be short and precise.

## 1.0.0 (2026-11-03)
Initial tracked version. Jira-only PM plugin (adapted from the earlier server-based version): Jira is the source of truth. The PM drafts `requirements.md` and `acceptance-criteria.md`, writes them into the Jira ticket, and hands off to design or development. The single acceptance-criteria approval is a local, human-only gate (`/aisdlc-pm:approve <T> acceptance_criteria`) enforced by the state engine on hand-off; there is no server push/pull.
