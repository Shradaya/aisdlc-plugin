---
name: pr
description: Alias for the pull-request skill (spec command /aisdlc:pr). Use only when the developer runs /aisdlc:pr.
argument-hint: <ticket-number>
disable-model-invocation: true
---

# pr

Spec §51 names the command `/aisdlc:pr`; the skill directory defined by spec §7 is `pull-request`. This alias exists only to provide the command name.

Read `${CLAUDE_PLUGIN_ROOT}/skills/pull-request/SKILL.md` and follow it exactly with `$ARGUMENTS` = `<ticket-number>`. All prerequisites, state commands (`node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js ...`) and safety restrictions of that skill apply unchanged.
