# Changelog

What changed in aisdlc-dev, newest first. Versions: **major** when people must act, **minor** for something new, **patch** for fixes. README, tests and docs-site changes need no version. Every behavior change to this plugin needs a bump here and in `.claude-plugin/plugin.json` (checked by `node scripts/version-check.js --base <ref>`).

## 1.1.1 (2026-11-06)
Skill and agent descriptions no longer contain angle brackets (uploads reject them as XML tags) and are valid strict YAML.

## 1.1.0 (2026-11-06)
New `/aisdlc-dev:pr-comments`: reads the review comments on a task's pull request, triages them with the developer, fixes the valid ones under the normal rules, asks before committing and pushing, then replies. Generated documents are now required to be short and precise. The Bitbucket helper gains `comments` (read) and `comment --parent` (reply).

## 1.0.0 (2026-11-03)
Initial tracked version.
