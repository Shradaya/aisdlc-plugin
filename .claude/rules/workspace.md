# Workspace rules

- This repository is the aisdlc control plane. It stores knowledge about code repositories, never their source code.
- Registered code repositories are listed in `config/repositories.yaml`; their source is the implementation source of truth. Conflict precedence: current repository code/config/history, then current Jira, then human-approved aisdlc docs, then `observed` knowledge, then `inferred`, then unverified assumptions. If two authoritative sources conflict, stop in CONFLICTED instead of guessing.
- Do not load the whole workspace for a task. Use `tasks/<ticket>/knowledge-manifest.yaml` and read only the listed knowledge.
- Generated knowledge carries provenance: analyzed commit SHA, timestamp, generator version, status (observed | inferred | human-confirmed | deprecated | conflicted), evidence, confidence. Never promote to `human-confirmed` without explicit human approval.
- Layout: `skills/` procedures, `agents/` subagents, `workflows/` lifecycle references, `config/` policy and schemas, `repositories/<repo>/` repository knowledge, `system/` architecture, decisions and product knowledge, `tasks/<ticket>/` task state and artifacts, `logs/audit.jsonl` audit.
- Never invent missing critical ticket information; ask the developer.
