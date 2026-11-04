---
name: cross-repo-trace
description: Trace the contracts a change touches (fields, collections, endpoints, queue or event payloads, shared constants) through the code of every registered repository, and write tasks/<ticket>/trace.md with every producer and consumer, drifted copies, repositories nobody listed, what must change together and a deploy order. Mandatory before source edits when a task spans two or more repositories or changes a shared contract.
argument-hint: <ticket-number>
---

# cross-repo-trace

## Purpose
`impact-analysis` works from the registry, the relationship graph and generated knowledge about each repository. This skill checks the **code**: for the specific things the ticket changes, who writes them, who reads them, which copies exist and whether they already differ. It is what finds the consumer nobody registered, and it fixes the deploy order before anything is built.

## Invocation conditions
Called by the `feature` and `bug` skills right after the affected repositories are confirmed and before repository preparation, so the list of repositories is final before any branch is cut. Also on request, for any task.

It is **required** (the source-edit hook blocks until it is done) when `${CLAUDE_PLUGIN_ROOT}/config/policies.yaml` has `require_trace_for_cross_repo: true` for the task family and either:
- the task's `repositories` has two or more entries, or
- `trace_required` is true in task state (step 2 sets it when a shared contract changes, even in a single repository).

## Inputs
`tasks/<TICKET>/impact-analysis.md` (sections "APIs / Interfaces", "Database / Data", "Events / Messaging"), `requirements.md` or `jira.md` and `root-cause.md`, `config/repositories.yaml`, `repositories/<repo>/{interfaces,data-model}.md`, `node ${CLAUDE_PLUGIN_ROOT}/scripts/graph/aisdlc-graph.js neighbors <repo>`.

## Prerequisites
- `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>` shows the affected repositories confirmed (`repositories` set).
- Every registered code repository you will search has a local path (`scripts/lib/repo-paths.js`); one without is listed under Unknowns, not skipped silently.

## Procedure
1. Applicability: read `repositories` and `trace_required` from state. Two or more repositories, or a changed shared contract, means the trace is required. Otherwise say it is not required and stop; write nothing.
2. Subjects: from the impact analysis and the requirement, list the contract elements the ticket changes or adds (a field, a collection or table, an endpoint, a queue or event name with its payload fields, a shared constant or enum), at most about eight, each stated exactly as it appears in code. If the ticket changes one of them but the repository list has only one entry, record that: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> trace_required true`. When it is unclear what is being changed, ask the developer; never guess a subject.
3. Repositories to search: **every registered code repository** (`kind` is not `design`), not only the affected ones. For each, resolve the local path with `scripts/lib/repo-paths.js` and gather `git -C <path> branch --show-current`.
4. Launch the `service-tracer` subagent with only: the subjects, the repository names with their paths and branches, and the graph neighbours and knowledge file names as hints. Not the specification, a plan or any reasoning about the implementation.
5. Write `tasks/<TICKET>/trace.md` from its answer, with exactly these sections: Subjects; Hits (repository, `file:line`, role, note); Flow; Copies and drift; Repositories with hits that are not in the affected list; Must change together; Deploy order; Unknowns. Check every section is present and every hit has a `file:line` you can open. No secrets and no real data.
6. Unlisted repositories: if the trace found hits in a repository that is not in `repositories`, show them to the developer (AskUserQuestion: add / not affected, with the evidence). Added ones are recorded with `set <TICKET> repositories '[...]'` and an audit `repo-selected`; they must pass repository preparation like the others. A repository confirmed as not affected stays out, with the reason in `trace.md`.
7. Record: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js set <TICKET> workflow.trace '"completed"'` and append audit `trace-complete` (subjects, repositories searched, hits, unlisted repositories found) to `tasks/<TICKET>/execution-log.jsonl`.
8. Hand-off: the specification's dependency and deployment sections, and `implementation-planner`'s "Cross-repository sequencing", take "Must change together" and "Deploy order" from `trace.md`; `code-review` checks the diff against the "Must change together" list.

## Outputs
`tasks/<TICKET>/trace.md`; `workflow.trace` (and `trace_required` / `repositories` when changed) in task state; audit events.

## Failure behavior
A repository with no local path, or a subject with no hits, is reported under Unknowns and the developer is told; the trace is still written, and it is the developer who decides whether it is enough to proceed. A tracer failure: report; do not mark `workflow.trace` completed.

## Safety restrictions
Read-only against every repository: no checkout, no fetch-and-merge, no running of their code. Writes only `trace.md` and state through the CLI. Never edit `task.yaml` directly. Does not run for the sake of running: when it is not required and was not asked for, stop at step 1.
