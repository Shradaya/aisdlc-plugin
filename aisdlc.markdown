# AI-SDLC Implementation Specification

**Document:** AI-SDLC — Centralized AI Software Development Lifecycle
**Version:** 1.1
**Status:** Implementation Baseline
**Audience:** Software engineers, data engineers, architects, DevOps engineers, engineering managers, AI/Claude Code administrators
**Primary execution environment:** Claude Code
**Control-plane repository:** Dedicated aisdlc working-space repository

---

## 1. Executive Summary

This document defines a complete implementation for an **AI-SDLC**: a centralized, stateful software-development lifecycle in which Claude Code operates from a dedicated engineering workspace and orchestrates work across multiple software repositories.

The AI-SDLC is not a prompt collection. It is a controlled workflow system with:

- a central aisdlc workspace;
- standardized repository onboarding and repository knowledge;
- explicit task types and task states;
- Jira integration with an interactive fallback when Jira is unavailable;
- impact analysis before code changes;
- mandatory feature specifications and human approval gates;
- deterministic repository preparation;
- standardized branch and commit conventions;
- repository-specific testing knowledge;
- specialized skills and subagents;
- deterministic hooks that enforce critical invariants;
- persistent task state, audit records, and provenance;
- controlled permissions and safety boundaries;
- PR, CI, documentation, and completion workflows;
- a mandatory post-release product-knowledge consolidation step that converts temporary feature knowledge into durable product-understanding documentation before temporary feature artifacts are deleted.

The authoritative workflow principle is:

> **Understand → Analyze → Specify → Approve → Plan → Implement → Validate → Review → Commit → PR → CI → Merge → Release → Consolidate Product Knowledge → Clean Up Temporary Artifacts → Complete**

For features, implementation MUST be blocked until the specification is approved.

---

# 2. Scope

## 2.1 In scope

The AI-SDLC controls:

1. Repository registration and understanding.
2. Repository knowledge generation and refresh.
3. Repository architecture and dependency mapping.
4. Repository testing approach discovery.
5. Jira ticket retrieval.
6. Jira fallback data collection through interactive questions.
7. Task classification.
8. Feature, bug, refactor, API-change, database-change, investigation, dependency-upgrade, and documentation workflows.
9. Cross-repository impact analysis.
10. Task specifications.
11. Human approval gates.
12. Git branch preparation.
13. Git commit rules.
14. Test execution and validation.
15. AI-assisted review.
16. Pull-request preparation.
17. CI result handling.
18. Documentation and architecture decision updates.
19. Task state persistence.
20. Audit logging.
21. Knowledge provenance and freshness.
22. Post-release product-knowledge consolidation and cleanup of temporary feature artifacts.
23. Failure recovery and workflow resume.
24. Claude Code skills, subagents, hooks, MCP integrations, and project configuration.

## 2.2 Out of scope by default

The following are prohibited unless separately enabled by explicit organizational policy:

- direct production deployment;
- direct production database modification;
- destructive infrastructure operations;
- force pushes;
- automatic conflict resolution on `main`;
- rewriting shared Git history;
- automatic Jira workflow transitions whose target status has not been explicitly configured;
- automatically discarding developer changes.

---

# 3. Normative Language

The keywords below are normative:

- **MUST** = mandatory implementation requirement.
- **MUST NOT** = prohibited behavior.
- **SHOULD** = default recommendation; deviating requires a documented reason.
- **MAY** = optional behavior.

No workflow may silently invent missing information. Critical unknowns MUST either be resolved from authoritative sources or explicitly requested from the developer.

---

# 4. Core Design Decisions

The following decisions are fixed for version 1.1.

| Area | Decision |
|---|---|
| Claude working model | Central AI-SDLC control plane rather than `/init` in each code repository |
| Repository onboarding | `/aisdlc:add-repo <repo-name> <repo-path>` |
| Feature entry point | `/aisdlc:feature <ticket-number>` |
| Bug entry point | `/aisdlc:bug <ticket-number>` |
| Jira integration | MCP/connector-backed adapter |
| Jira unavailable | Use interactive `AskUserQuestion` fallback; never guess |
| Feature specification | Mandatory |
| Feature implementation gate | Specification approval MUST occur before implementation |
| Impact analysis | Mandatory before implementation |
| Repository preparation | Stash → switch to `main` → pull `main` → create `<ticket-number>` branch |
| Branch name | Exactly `<ticket-number>` |
| Commit format | Exactly `<ticket-number>: <changes summary>` |
| Commit body | None by default |
| Repository code source of truth | Actual repository code/config/history |
| System knowledge source | AI-SDLC workspace |
| AI-generated knowledge | Must carry provenance and freshness metadata |
| Workflow state | `tasks/<ticket-number>/task.yaml` |
| Safety enforcement | Claude Code hooks + permission rules |
| Repeatable procedures | Skills |
| Isolated analytical work | Subagents |
| External systems | MCP adapters |
| Workflow orchestration | Skills/workflow files + deterministic helper scripts |
| Long-term architecture rationale | ADRs |
| Production access | Disabled by default |
| Post-release knowledge | Consolidate implemented product behavior into durable product-understanding docs before temporary feature artifacts are deleted |
| Post-release command | `/aisdlc:post-release <ticket-number>` |
| Temporary task knowledge | Deleted only after successful consolidation and validation; audit/completion metadata retained |
| Product-understanding location | `system/product/` in the control-plane repository |

The system MUST NOT depend on Claude Code `/init` for repository onboarding.

---

# 5. System Architecture

```text
                              ┌───────────────────────────┐
                              │       Jira / Tracker      │
                              └─────────────┬─────────────┘
                                            │ MCP
                                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         AI-SDLC WORKSPACE                             │
│                                                                      │
│  Commands / Skills / Agents / Hooks / Rules / Policies / Schemas     │
│                                                                      │
│  Repository Registry ── Knowledge ── Architecture ── Decisions       │
│                                                                      │
│  Task State ── Specifications ── Plans ── Validation ── Audit        │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                    Task classification
                                │
                    Impact / knowledge selection
                                │
                         Workflow engine
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
          Backend           Frontend          Database
          Repository        Repository        Repository
              │                 │                 │
              └─────────────────┼─────────────────┘
                                │
                         Git / Tests / CI
                                │
                         PR / Review / Docs
```

The central workspace is the **control plane**. Code repositories remain the **implementation source of truth**.

---

# 6. Claude Code Extension Model

The implementation uses Claude Code capabilities according to the following responsibilities.

| Claude Code capability | AI-SDLC responsibility |
|---|---|
| `CLAUDE.md` | Small set of always-active workspace rules and navigation instructions |
| Skills | Repeatable task procedures and specialized domain knowledge |
| Subagents | Deep isolated analysis and specialized reviews |
| Hooks | Deterministic enforcement, logging, and blocking of unsafe actions |
| MCP | Jira, Git hosting, CI/CD, documentation systems, and other external services |
| Permission rules | Tool access boundaries |
| Plugins | Distribution and namespacing of the complete `aisdlc` capability set |

Current Claude Code documentation explicitly differentiates always-loaded instructions, on-demand skills, isolated subagents, MCP integrations, and event-driven hooks. Hooks are particularly suitable for deterministic enforcement such as blocking tool calls; skills are suitable for reusable workflows and domain procedures. [Anthropic Claude Code documentation, current as of September 2026.]

The preferred distribution model is a **private Claude Code plugin named `aisdlc`**, so the command interface can use namespaced commands such as:

```text
/aisdlc:feature FEAT-1234
/aisdlc:add-repo backend ../backend
/aisdlc:commit FEAT-1234
```

---

# 7. Control-Plane Repository Structure

The dedicated AI-SDLC repository MUST use the following structure.

```text
aisdlc-workspace/
│
├── CLAUDE.md
│
├── .claude-plugin/
│   └── plugin.json
│
├── .claude/
│   ├── settings.json
│   └── rules/
│       ├── workspace.md
│       ├── safety.md
│       ├── git.md
│       └── task-gates.md
│
├── hooks/
│   ├── hooks.json
│   ├── session-start.sh
│   ├── pre-tool-policy.sh
│   ├── post-tool-audit.sh
│   └── stop-validation.sh
│
├── skills/
│   ├── add-repo/
│   │   └── SKILL.md
│   ├── refresh-repo/
│   │   └── SKILL.md
│   ├── jira-ticket/
│   │   └── SKILL.md
│   ├── feature/
│   │   └── SKILL.md
│   ├── bug/
│   │   └── SKILL.md
│   ├── impact-analysis/
│   │   └── SKILL.md
│   ├── feature-specification/
│   │   └── SKILL.md
│   ├── repository-preparation/
│   │   └── SKILL.md
│   ├── testing/
│   │   └── SKILL.md
│   ├── commit/
│   │   └── SKILL.md
│   ├── code-review/
│   │   └── SKILL.md
│   ├── pull-request/
│   │   └── SKILL.md
│   ├── documentation/
│   │   └── SKILL.md
│   ├── product-knowledge-consolidation/
│   │   └── SKILL.md
│   └── adr/
│       └── SKILL.md
│
├── agents/
│   ├── repository-analyst.md
│   ├── architecture-analyst.md
│   ├── dependency-analyst.md
│   ├── test-analyst.md
│   ├── impact-analyst.md
│   ├── specification-writer.md
│   ├── implementation-planner.md
│   ├── backend-reviewer.md
│   ├── frontend-reviewer.md
│   ├── database-reviewer.md
│   ├── test-reviewer.md
│   ├── security-reviewer.md
│   └── documentation-reviewer.md
│
├── workflows/
│   ├── feature.md
│   ├── bug.md
│   ├── refactor.md
│   ├── database-change.md
│   ├── api-change.md
│   ├── dependency-upgrade.md
│   ├── investigation.md
│   └── documentation.md
│
├── config/
│   ├── workspace.yaml
│   ├── policies.yaml
│   ├── repositories.yaml
│   ├── integrations.yaml
│   ├── task-types.yaml
│   ├── testing-policy.yaml
│   └── schemas/
│       ├── repository.schema.yaml
│       ├── task.schema.yaml
│       ├── specification.schema.yaml
│       └── impact-analysis.schema.yaml
│
├── repositories/
│   └── <repo-name>/
│       ├── repository.yaml
│       ├── overview.md
│       ├── structure.md
│       ├── architecture.md
│       ├── dependencies.md
│       ├── interfaces.md
│       ├── data-model.md
│       ├── testing.md
│       ├── build-release.md
│       ├── security.md
│       ├── conventions.md
│       ├── change-impact.md
│       └── metadata.json
│
├── system/
│   ├── architecture/
│   ├── domains/
│   ├── integrations/
│   ├── repository-relationships.yaml
│   ├── data-flows/
│   ├── product/
│   │   ├── product-overview.md
│   │   ├── feature-catalog.yaml
│   │   ├── capabilities/
│   │   ├── user-workflows/
│   │   ├── business-rules/
│   │   └── glossary.md
│   └── decisions/
│
├── tasks/
│   └── <ticket-number>/
│       ├── task.yaml
│       ├── jira.md
│       ├── requirements.md
│       ├── impact-analysis.md
│       ├── knowledge-manifest.yaml
│       ├── specification.md
│       ├── approvals.yaml
│       ├── implementation-plan.md
│       ├── validation.md
│       ├── code-review.md
│       ├── documentation.md
│       ├── release.yaml
│       ├── knowledge-consolidation.yaml
│       ├── execution-log.jsonl
│       └── repository-preparation.yaml
│
├── scripts/
│   ├── git/
│   ├── knowledge/
│   ├── validation/
│   ├── audit/
│   └── state/
│
└── logs/
    └── audit.jsonl
```

---


# 7A. Canonical Plugin Manifest

The AI-SDLC must be packaged as a Claude Code plugin named `aisdlc`. Claude Code plugins use `.claude-plugin/plugin.json` for the plugin manifest and can bundle skills, agents, hooks, and MCP configuration. Plugin skills are namespaced with the plugin name, which gives the required interface such as `/aisdlc:feature`. [Anthropic Claude Code Plugins documentation.]

Minimal manifest:

```json
{
  "name": "aisdlc",
  "version": "1.0.0",
  "description": "AI-SDLC engineering lifecycle and governance plugin"
}
```

The plugin version MUST be incremented for changes to workflow behavior, policies, skill contracts, hook behavior, schemas, or integration adapters.

The control-plane repository and the plugin are versioned together for v1.0. Developers MUST load the plugin from the central workspace repository or from the organization's approved plugin distribution mechanism.

# 8. Workspace Responsibilities

The workspace owns:

- repository registry;
- system architecture;
- cross-repository relationships;
- domains and business capabilities;
- reusable workflows;
- organizational rules;
- skills and agents;
- task artifacts;
- task state;
- audit records;
- AI-generated repository knowledge;
- architectural decisions.

The workspace MUST NOT become a copy of the source-code repositories.

It stores **knowledge about repositories**, not their source code.

---

# 9. Source-of-Truth Hierarchy

When information conflicts, the system MUST use this precedence:

1. Current code/configuration/history in the relevant repository.
2. Current Jira ticket and authoritative external system data.
3. Human-approved AI-SDLC documentation.
4. AI-generated repository knowledge marked `observed`.
5. AI-derived/inferred knowledge.
6. Unverified conversation assumptions.

Lower-priority information MUST NOT override higher-priority evidence.

If two authoritative sources conflict, the workflow MUST enter an explicit conflict state rather than guessing.

---

# 10. Knowledge Provenance

Every generated knowledge artifact MUST carry:

- analyzed repository commit SHA;
- analysis timestamp;
- generator version;
- knowledge status;
- evidence references;
- confidence.

Allowed `status` values:

```text
observed
inferred
human-confirmed
deprecated
conflicted
```

Allowed `confidence` values:

```text
high
medium
low
```

Example:

```yaml
repository:
  name: backend
  analyzed_commit: 4a97d3b
  analyzed_at: 2026-09-30T18:00:00+05:45
knowledge:
  deployment:
    platform: aws
    status: observed
    confidence: high
    evidence:
      - infra/terraform/
      - .github/workflows/deploy.yml
```

AI MUST NOT turn an inference into `human-confirmed` status without explicit human approval.

---

# 11. Repository Registry

The canonical registry is `config/repositories.yaml`.

Example:

```yaml
workspace:
  repository: aisdlc-workspace

repositories:
  backend:
    path: ../company-backend
    role: backend-service
    base_branch: main
    domains:
      - reporting
      - authentication
    depends_on:
      - database
      - auth-service
    provides:
      - rest-api
    deployment:
      environment: aws

  database:
    path: ../company-database
    role: database
    base_branch: main
    domains:
      - reporting
      - users
    depends_on: []
    provides:
      - relational-schema
```

Required fields:

```text
name
path
role
base_branch
domains
depends_on
provides
```

For managed repositories, `base_branch` MUST equal `main`. A repository with another default branch MUST be marked non-compliant and MUST NOT enter an implementation workflow until explicitly remediated.

---

# 12. `/aisdlc:add-repo`

## 12.1 Command

```text
/aisdlc:add-repo <repo-name> <repo-path>
```

Example:

```text
/aisdlc:add-repo backend ../company-backend
```

## 12.2 Command contract

The command MUST:

1. Resolve the path to a canonical filesystem path.
2. Confirm the path exists.
3. Confirm it is a Git repository.
4. Identify the remote URL.
5. Identify the current HEAD commit.
6. Identify the `main` branch and verify it exists.
7. Read-only inspect the repository.
8. Run the standardized repository study.
9. Run the standardized test-system study.
10. Generate the repository knowledge package.
11. Register the repository in `config/repositories.yaml`.
12. Update cross-repository relationship data using already registered repositories.
13. Record analysis metadata.
14. Report unknowns explicitly.

The command MUST NOT:

- checkout another branch;
- stash files;
- create branches;
- modify source code;
- modify the repository's configuration;
- commit changes to the code repository.

Repository onboarding is read-only.

## 12.3 Study phases

The repository MUST be studied in this exact sequence:

```text
Phase A: Identity
Phase B: Structure
Phase C: Architecture
Phase D: Dependencies
Phase E: Interfaces
Phase F: Data model
Phase G: Testing
Phase H: Build and release
Phase I: Security baseline
Phase J: Conventions
Phase K: Change-impact map
Phase L: Synthesis and verification
```

Parallel analysis MAY be used after Phase B because Claude Code subagents can work in isolated contexts. The final synthesis agent MUST reconcile outputs against repository evidence.

---

# 13. Standard Repository Study

Every registered repository MUST receive the same baseline study.

## 13.1 Identity

Document:

- repository name;
- remote URL;
- local path;
- default branch;
- current commit;
- code owners if present;
- repository type;
- primary languages;
- framework(s);
- package/build manager(s);
- containerization approach.

## 13.2 Structure

Document:

- source directories;
- test directories;
- configuration directories;
- infrastructure directories;
- migrations;
- scripts;
- CI/CD definitions;
- documentation;
- generated-code directories;
- ignored/generated artifacts.

The study MUST produce a high-level directory map without copying the source tree verbatim.

## 13.3 Architecture

Identify:

- application entry points;
- runtime processes;
- internal modules;
- service boundaries;
- data flows;
- external integrations;
- authentication and authorization boundaries;
- configuration flow;
- persistence boundaries;
- asynchronous/event boundaries;
- failure handling;
- background workers;
- scheduled jobs.

Architecture claims MUST include evidence.

## 13.4 Dependencies

Document:

- package dependencies;
- important runtime libraries;
- internal repositories;
- external systems;
- databases;
- message brokers;
- APIs;
- shared libraries;
- generated clients.

Dependencies MUST be classified as:

```text
direct
indirect
runtime-only
build-only
test-only
external-system
internal-repository
```

## 13.5 Interfaces

Document:

- REST endpoints;
- GraphQL operations if applicable;
- event topics;
- queues;
- file interfaces;
- database interfaces;
- scheduled interfaces;
- CLI interfaces;
- third-party integrations.

For APIs, capture:

- route;
- method;
- authentication requirement;
- request schema;
- response schema;
- error behavior;
- known consumers.

## 13.6 Data model

Document:

- databases;
- schemas;
- important tables/collections;
- migrations;
- data ownership;
- read/write patterns;
- indexes;
- retention rules if documented;
- sensitive data categories if discoverable.

## 13.7 Security baseline

Identify:

- authentication mechanism;
- authorization mechanism;
- secret sources;
- environment variables containing sensitive values;
- encryption mechanisms;
- network boundaries;
- service identities;
- audit logging;
- input validation;
- dependency scanning;
- known security gates in CI.

The repository study MUST NOT print secret values into workspace artifacts or logs.

---

# 14. Standardized Repository Test Study

Every repository MUST have a `testing.md` artifact using the same structure.

```markdown
# Testing Profile

## Frameworks

## Test Layers

## Commands

## Test Data

## Fixtures and Mocks

## Environment Requirements

## Database / Infrastructure Requirements

## Coverage

## CI Integration

## Required Pre-merge Checks

## Regression Strategy

## Flaky / Quarantined Tests

## Known Gaps

## Feature Test Decision Rules
```

## 14.1 Test layers

The study MUST identify all applicable layers:

```text
unit
integration
contract
API
component
end-to-end
data-quality
migration
performance
security
smoke
```

For each layer record:

| Field | Required |
|---|---|
| Layer | Yes |
| Framework | Yes |
| Command | Yes |
| Scope | Yes |
| Prerequisites | Yes |
| CI stage | Yes |
| Required for merge | Yes/No |
| Typical runtime | Yes |
| Test data strategy | Yes |
| Known failures/flakiness | Yes |

If a value cannot be established, it MUST be recorded as `unknown` with evidence of what was checked.

## 14.2 Feature test derivation

For every feature implementation, the testing skill MUST derive a test matrix from:

1. Jira acceptance criteria;
2. feature specification;
3. affected repository testing profiles;
4. changed interfaces;
5. database/data changes;
6. known regression surfaces.

The result MUST be stored in `tasks/<ticket>/validation.md`.

## 14.3 Definition of validation completion

A task cannot be marked `VALIDATED` unless:

- all mandatory test layers pass;
- all required static checks pass;
- all required migration checks pass;
- all acceptance criteria have explicit validation evidence;
- known failures are either resolved or covered by an approved waiver.

---

# 15. `/aisdlc:refresh-repo`

## Command

```text
/aisdlc:refresh-repo <repo-name>
```

The refresh operation MUST:

1. read the previously analyzed commit;
2. determine current HEAD;
3. calculate changed files since the analyzed commit;
4. classify changed areas;
5. identify affected knowledge artifacts;
6. update only affected artifacts where safe;
7. trigger a full repository study if a structural change is detected;
8. update provenance metadata;
9. update cross-repository relationships if interfaces or dependencies changed.

Structural-change triggers requiring full review:

- build system change;
- framework migration;
- top-level source structure change;
- new/removed service;
- deployment architecture change;
- database technology change;
- API contract change;
- event contract change;
- dependency graph change involving another registered repository.

Refresh MUST NOT modify the source repository.

---

# 16. Knowledge Selection

Claude MUST NOT load the entire workspace for every task.

The knowledge selector uses:

```text
Task type
+ Jira content
+ Domain
+ Repository graph
+ Changed interfaces
+ Relevant file paths
+ Specification references
= Knowledge manifest
```

For each task the system creates:

```text
tasks/<ticket>/knowledge-manifest.yaml
```

Example:

```yaml
task: FEAT-1234
repositories:
  - backend
  - database
  - frontend
knowledge:
  - repositories/backend/repository.yaml
  - repositories/backend/architecture.md
  - repositories/backend/interfaces.md
  - repositories/backend/testing.md
  - repositories/database/data-model.md
  - repositories/database/testing.md
  - system/architecture/reporting.md
  - system/repository-relationships.yaml
```

The knowledge selector MUST prioritize small, directly relevant artifacts and only load deeper material when required.

---

# 17. Task Model

Every engineering task MUST have a task directory.

```text
tasks/<ticket-number>/
```

The canonical state is stored in `task.yaml`.

Example:

```yaml
task:
  id: FEAT-1234
  type: feature
  status: AWAITING_SPEC_APPROVAL
  lifecycle: feature
  created_at: 2026-10-01T20:30:00+05:45
  updated_at: 2026-10-01T21:20:00+05:45

source:
  type: jira
  issue_key: FEAT-1234
  snapshot_hash: sha256:...

repositories:
  - backend
  - database
  - frontend

domains:
  - reporting
  - scheduling

workflow:
  jira: completed
  requirements: completed
  impact_analysis: completed
  repository_preparation: completed
  specification: completed
  specification_approval: pending
  implementation_plan: pending
  implementation: blocked
  validation: pending
  review: pending
  commit: pending
  pull_request: pending
  ci: pending
  merge: pending
  production_release: pending
  product_knowledge_consolidation: pending
  temporary_artifact_cleanup: blocked

release:
  status: not-released
  environment: null
  reference: null
  released_at: null

knowledge_consolidation:
  status: pending
  product_documents_changed: []
  source_artifacts_deleted: false
```

---

# 18. Task State Machine

## 18.1 Feature states

```text
CREATED
  ↓
TICKET_READY
  ↓
UNDERSTOOD
  ↓
IMPACT_ANALYZED
  ↓
REPOSITORIES_IDENTIFIED
  ↓
REPOSITORIES_PREPARED
  ↓
SPEC_DRAFTED
  ↓
AWAITING_SPEC_APPROVAL
  ↓
SPEC_APPROVED
  ↓
PLAN_DRAFTED
  ↓
AWAITING_PLAN_APPROVAL   (required for major/cross-repo changes)
  ↓
IMPLEMENTING
  ↓
VALIDATING
  ↓
REVIEWING
  ↓
COMMITTING
  ↓
COMMITTED
  ↓
PR_CREATED
  ↓
CI_VALIDATING
  ↓
MERGE_READY
  ↓
MERGED
  ↓
RELEASE_PENDING
  ↓
RELEASED
  ↓
KNOWLEDGE_CONSOLIDATION_PENDING
  ↓
KNOWLEDGE_CONSOLIDATED
  ↓
TEMPORARY_ARTIFACTS_CLEANED
  ↓
COMPLETED
```

Allowed failure states:

```text
BLOCKED
WAITING_FOR_INPUT
WAITING_FOR_APPROVAL
CONFLICTED
FAILED
CANCELLED
```

## 18.2 Bug states

```text
CREATED
  ↓
TICKET_READY
  ↓
UNDER_INVESTIGATION
  ↓
ROOT_CAUSE_CONFIRMED
  ↓
REPOSITORIES_IDENTIFIED
  ↓
REPOSITORIES_PREPARED
  ↓
IMPLEMENTING
  ↓
VALIDATING
  ↓
REVIEWING
  ↓
COMMITTING
  ↓
COMMITTED
  ↓
PR_CREATED
  ↓
CI_VALIDATING
  ↓
COMPLETED
```

A bug MAY require a mini-plan when it affects multiple repositories, APIs, databases, infrastructure, or security-sensitive behavior.

---

# 19. Workflow Gate Enforcement

The workflow state is authoritative for permissions.

Examples:

| State | Repository source edits | Git commit | PR | Spec edits |
|---|---:|---:|---:|---:|
| `UNDERSTOOD` | No | No | No | Yes |
| `IMPACT_ANALYZED` | No | No | No | Yes |
| `AWAITING_SPEC_APPROVAL` | **No** | No | No | Yes |
| `SPEC_APPROVED` | Yes | No | No | Yes with versioning |
| `IMPLEMENTING` | Yes | Yes after commit gate | No | No without reapproval |
| `VALIDATING` | Yes for fixes | Yes | No | No |
| `COMMITTED` | No except follow-up fixes | Yes | Yes | No |

The key enforcement rule is:

> **Before `SPEC_APPROVED`, Claude may modify task artifacts, but MUST NOT modify application source files in registered repositories.**

This rule MUST be enforced with a hook, not only with natural-language instructions.

---

# 20. Jira Integration

## 20.1 Preferred integration

Jira access MUST be provided through an MCP/connector adapter whenever available.

The adapter must support:

```text
get issue
get fields
get description
get acceptance criteria / relevant custom fields
get labels
get priority
get linked issues
get comments when required
```

Write operations SHOULD include:

```text
add comment
add link / PR reference
update configured workflow status
```

Jira transitions MUST be explicitly configured; no generic transition mapping may be assumed.

The Jira API token MUST be granted the following read scopes; aisdlc requires no write scope by default:

```text
read:issue:jira          fetch the ticket and its basic fields
read:issue-details:jira  description, labels, priority, linked issues
read:comment:jira        comments, only when the workflow asks for them
read:field:jira          find the custom field holding acceptance criteria
read:project:jira        resolve the project a ticket belongs to
read:jira-user           optional: assignee and reporter names
```

Write scopes (for example `write:comment:jira`, `write:issue:jira`) are required only if the corresponding write operations are explicitly enabled in `config/integrations.yaml`.

The Bitbucket API token MUST be granted the following scopes:

```text
read:repository:bitbucket    read repository content and pull request diffs
read:pullrequest:bitbucket   read pull request details and status
write:pullrequest:bitbucket  create pull requests (and post PR comments if enabled)
```

## 20.2 Feature startup

When executing:

```text
/aisdlc:feature FEAT-1234
```

Claude MUST first retrieve the ticket.

The Jira snapshot MUST be stored in:

```text
tasks/FEAT-1234/jira.md
```

The snapshot hash MUST be stored in `task.yaml`.

## 20.3 Jira unavailable fallback

If the Jira integration is unavailable, disconnected, missing credentials, or cannot retrieve the issue, Claude MUST NOT guess ticket details.

It MUST use interactive questions to collect the required information.

For a feature, required fields are:

```text
Ticket number
Title
Problem / business requirement
Functional requirements
Acceptance criteria
Known constraints
Known dependencies or related tickets, if applicable
```

For a bug, required fields are:

```text
Ticket number
Title
Problem description
Expected behavior
Actual behavior
Reproduction steps
Environment
Acceptance / resolution criteria
```

The fallback data MUST be stored in `jira.md` with:

```yaml
source:
  type: user-provided
  jira_available: false
```

Claude MUST clearly distinguish user-supplied details from Jira-sourced details.

## 20.4 Ticket drift

Before implementation, the system SHOULD re-check the Jira ticket when integration is available.

If material ticket content changed after specification approval:

```text
SPEC_APPROVED
     ↓
JIRA_CHANGED
     ↓
SPEC_REVIEW_REQUIRED
     ↓
REAPPROVAL
```

Implementation MUST be blocked until reapproval.

---

# 21. `/aisdlc:feature <ticket-number>`

This is the primary feature-development workflow.

The feature command creates the temporary task specification and analysis artifacts required to safely implement the feature. Those artifacts are **not** the long-term product knowledge base. Once the feature is released to production, `/aisdlc:post-release <ticket-number>` consolidates the released behavior into `system/product/` and removes the temporary artifacts after validation.

## 21.1 Required sequence

The command MUST execute the following sequence:

```text
1. Validate ticket number
2. Retrieve Jira ticket or ask for details
3. Create task workspace
4. Understand the requirement
5. Identify domains
6. Identify candidate repositories
7. Perform impact analysis
8. Confirm affected repositories
9. Prepare every affected repository
10. Generate feature specification
11. Ask for human approval
12. Generate implementation plan
13. Ask for plan approval when required
14. Implement
15. Run repository-specific tests
16. Run cross-repository validation
17. Perform AI review
18. Commit using commit skill
19. Push / create PR according to configured policy
20. Validate CI
21. Merge according to configured policy
22. Wait for / verify production release
23. Run `/aisdlc:post-release <ticket-number>`
24. Consolidate product understanding from the implemented feature
25. Validate durable documentation
26. Delete temporary feature-specific specification and analysis artifacts
27. Retain completion and audit metadata
28. Complete task
```

## 21.2 Understanding stage

Claude MUST summarize:

- what is being requested;
- why it is being requested;
- acceptance criteria;
- important constraints;
- unknowns;
- suspected affected domains.

Unknowns that materially affect the design MUST be resolved before specification.

## 21.3 Repository identification

The impact analyst MUST identify:

- directly affected repositories;
- indirectly affected repositories;
- repositories reviewed and determined not to require changes.

Each repository entry MUST include a reason.

Example:

```text
backend
  Direct: new scheduling API and business logic.

database
  Direct: schedule persistence schema.

frontend
  Direct: schedule configuration UI.

notification-service
  Indirect: existing notification contract consumes report events.
```

---

# 22. Repository Preparation

Repository preparation begins only after the affected repository list has been determined.

## 22.1 Required sequence per repository

For each affected repository:

```text
1. Verify repository path.
2. Verify Git repository.
3. Verify no merge/rebase/cherry-pick is in progress.
4. Inspect current status.
5. Stash local changes including untracked files.
6. Checkout main.
7. Fetch origin.
8. Pull origin/main using fast-forward-only behavior.
9. Create branch <ticket-number>.
10. Verify branch is based on updated main.
11. Record result in repository-preparation.yaml.
```

## 22.2 Stashing

If the working tree or index contains changes, use a uniquely identifiable stash message:

```text
aisdlc: <ticket-number> pre-task stash
```

Untracked files MUST be included in the stash.

Ignored files MUST NOT be included unless explicitly required.

The system MUST record the stash reference in:

```text
tasks/<ticket-number>/repository-preparation.yaml
```

Example:

```yaml
backend:
  before:
    branch: feature/old-task
    status: dirty
  stash:
    created: true
    reference: stash@{0}
    message: aisdlc: FEAT-1234 pre-task stash
  branch:
    base: main
    created: FEAT-1234
    commit: 1c883fa
```

The previous stash MUST NOT be automatically popped.

## 22.3 Main branch update

The managed base branch is `main`.

The update must be equivalent to:

```bash
git checkout main
git fetch origin --prune
git pull --ff-only origin main
```

If fast-forward is impossible, the workflow MUST stop for that repository.

Claude MUST NOT automatically merge or rebase a diverged `main` branch.

## 22.4 Branch creation

The feature/bug branch MUST be named exactly:

```text
<ticket-number>
```

Example:

```text
FEAT-1234
```

No prefix, suffix, user name, date, or slug may be added.

## 22.5 Existing branch behavior

If `<ticket-number>` already exists locally or remotely:

- If a task record already exists and indicates an active task, resume only after verifying repository and branch identity.
- If no task record exists, stop and request explicit human action.
- Never overwrite, reset, delete, or recreate the existing branch automatically.

---

# 23. Feature Specification

Feature specification is a hard gate.

The specification MUST be written to:

```text
tasks/<ticket-number>/specification.md
```

## 23.1 Required structure

```markdown
# <TICKET> — <Title>

## 1. Executive Summary

## 2. Problem Statement

## 3. Business Objective

## 4. Functional Requirements

## 5. Non-Functional Requirements

## 6. Scope

### In Scope

### Out of Scope

## 7. Assumptions

## 8. Open Questions

## 9. Current System Behavior

## 10. Proposed System Behavior

## 11. User / Consumer Flow

## 12. Architecture Changes

## 13. Repository Impact

## 14. API / Interface Changes

## 15. Database / Data Changes

## 16. Event / Messaging Changes

## 17. Security Considerations

## 18. Error Handling

## 19. Backward Compatibility

## 20. Performance Considerations

## 21. Observability

## 22. Testing Requirements

## 23. Deployment Considerations

## 24. Rollback / Recovery Strategy

## 25. Acceptance Criteria

## 26. Risks

## 27. Dependencies

## 28. Alternatives Considered

## 29. Decisions Required
```

Not every feature needs a non-empty section, but every section MUST be reviewed. If not applicable, the section must explicitly state `Not applicable` and why.

## 23.2 Specification quality rules

The specification MUST:

- describe behavior, not merely files to edit;
- identify affected repositories;
- distinguish requirements from assumptions;
- distinguish known facts from inferred information;
- define acceptance criteria;
- identify migration and rollback needs;
- identify security and operational impact;
- identify testing requirements.

Claude MUST NOT begin implementation while the specification is `pending` or `rejected`.

---

# 24. Human Approval Gate

After the specification is generated, Claude MUST present an approval checkpoint.

The approval interaction MUST have these choices:

```text
Approve specification
Request changes
Reject task
```

Approval MUST result in:

```yaml
specification_approval:
  status: approved
  version: 1
  approved_at: 2026-10-01T21:45:00+05:45
```

If the specification changes after approval:

```text
version 1 approved
        ↓
material change
        ↓
version 2
        ↓
approval reset to pending
```

Implementation MUST be blocked until the current specification version is approved.

A convenience command MUST also be provided:

```text
/aisdlc:approve <ticket-number> specification
```

and:

```text
/aisdlc:reject <ticket-number> specification <reason>
```

---

# 25. Implementation Plan

The implementation plan is separate from the specification.

The specification answers:

> What should the system do?

The implementation plan answers:

> What exact code/configuration changes will implement it?

Required structure:

```markdown
# Implementation Plan

## Repository: backend

### Files / modules to change

### New files

### Detailed steps

### Tests

## Repository: database

...

## Repository: frontend

...

## Cross-repository sequencing

## Migration ordering

## Validation checkpoints

## Rollback checkpoints
```

The implementation plan MUST reference the specification.

For cross-repository, database, API, security-sensitive, or high-risk changes, the plan requires human approval before implementation.

---

# 26. Implementation Rules

Claude MUST:

1. Work only in repositories recorded in the task.
2. Use the task branch exactly named `<ticket-number>`.
3. Prefer small, reviewable changes.
4. Keep each change traceable to the approved specification.
5. Run relevant tests incrementally.
6. Avoid unrelated cleanup.
7. Avoid changing public interfaces unless the specification permits it.
8. Avoid dependency upgrades unless required by the task.
9. Update task validation evidence as tests are run.

Claude MUST NOT:

- modify unrelated repositories;
- modify repository configuration outside scope;
- change architecture without updating the specification or decision record;
- silently expand scope;
- disable tests merely to make CI pass;
- delete tests solely because they fail after a change unless replacement coverage is added and the reason is documented.

---

# 27. Subagent Strategy

Subagents SHOULD be used for isolated, high-value analytical tasks.

Recommended agents:

| Agent | Responsibility | Write access |
|---|---|---:|
| repository-analyst | repository inventory and architecture evidence | Workspace knowledge only |
| dependency-analyst | dependencies and relationships | Workspace knowledge only |
| architecture-analyst | architecture/data-flow analysis | Workspace knowledge only |
| test-analyst | test approach and CI study | Workspace knowledge only |
| impact-analyst | change-surface analysis | Task artifacts only |
| specification-writer | create specification | Task artifacts only |
| implementation-planner | produce implementation plan | Task artifacts only |
| security-reviewer | review code/design for security concerns | Review artifact only |
| test-reviewer | assess test completeness | Review artifact only |
| documentation-reviewer | assess documentation impact | Review artifact only |
| product-knowledge-analyst | compare released implementation, task artifacts, and current product docs to determine durable product-knowledge updates | Product knowledge artifacts only |

Implementation agents may modify registered repositories only after the feature specification gate passes.

Subagents MUST receive only the context required for their responsibility.

---

# 28. Skills

Skills represent reusable procedures.

## Required skills

```text
jira-ticket
repository-analysis
repository-refresh
impact-analysis
feature-specification
repository-preparation
testing
commit
code-review
pull-request
documentation
product-knowledge-consolidation
adr
```

## Skill rule

A skill MUST define:

- purpose;
- invocation conditions;
- inputs;
- prerequisites;
- procedure;
- outputs;
- failure behavior;
- safety restrictions;
- examples where useful.

Skills with side effects MUST NOT be silently invoked when doing so could create irreversible changes. They should be explicitly invoked by the workflow or guarded by state.

---

# 28A. `/aisdlc:post-release <ticket-number>`

The post-release command is mandatory for feature tasks before the task can reach `COMPLETED`. It is the only supported mechanism for converting temporary feature-specific knowledge into durable product understanding and then cleaning up the temporary artifacts.

Command:

```text
/aisdlc:post-release FEAT-1234
```

The command MUST:

1. load task state;
2. verify the task was merged;
3. verify production release;
4. invoke the product-knowledge-consolidation skill;
5. validate durable product documentation;
6. commit product-knowledge changes using the commit convention;
7. delete protected temporary task artifacts;
8. update task state and audit log;
9. mark the task `COMPLETED`.

The command MUST fail safely without deletion when any prerequisite is missing.

---

# 29. Commit Skill

The commit skill is a mandatory shared capability.

## 29.1 Commit format

Every aisdlc-managed commit MUST be:

```text
<ticket-number>: <changes summary>
```

Example:

```text
FEAT-1234: Add scheduled report generation
BUG-5678: Fix duplicate report creation
```

## 29.2 Commit restrictions

The commit skill MUST:

1. Identify the active task.
2. Confirm the current branch equals the task ticket number.
3. Inspect `git status`.
4. Inspect staged diff.
5. Stage only task-related changes.
6. Generate a concise summary from the actual diff.
7. Validate the commit message against the required pattern.
8. Create the commit.
9. Record commit hash in task state.

The commit MUST have no body unless a future policy explicitly allows one.

## 29.3 Message validation

The message MUST:

- start with the active ticket number;
- contain exactly `: ` after the ticket;
- contain a non-empty summary;
- describe the actual changes;
- fit on one line.

A commit with an invalid message MUST be blocked by a deterministic hook.

## 29.4 Example command

```bash
git add <approved files>
git diff --cached --check
git diff --cached
git commit -m "FEAT-1234: Add scheduled report generation"
```

---

# 29A. Product Knowledge Consolidation Skill

The `product-knowledge-consolidation` skill is the mandatory reusable procedure for post-release product understanding updates.

Its inputs are:

- active ticket/task state;
- approved feature specification;
- implementation plan;
- implementation diffs;
- validation results;
- release evidence;
- current product understanding documentation.

Its outputs are:

- updated `system/product/` documents;
- updated `feature-catalog.yaml`;
- a reconciliation record;
- a documentation validation result;
- a consolidation commit;
- updated task state;
- deletion of temporary artifacts after all gates pass.

The skill MUST NOT permanently archive the feature specification as a substitute for updating product knowledge. The purpose of the skill is to transform temporary task knowledge into a current, reusable product model.

---

# 30. Hook Strategy

Hooks are not a replacement for workflows. They are the **enforcement layer**.

The rule is:

> **Skills decide what should happen; hooks make critical rules difficult or impossible to bypass.**

Claude Code hooks can run on lifecycle/tool events and can block tool calls. This makes them appropriate for deterministic policies such as preventing an implementation edit before approval or rejecting invalid Git operations.

## 30.1 SessionStart hook

Purpose:

- verify Claude started in the AI-SDLC workspace;
- validate configuration;
- validate repository registry paths;
- check task files for corruption;
- report active task state.

It MUST NOT mutate code repositories.

## 30.2 UserPrompt / command-validation hook

Purpose:

- validate aisdlc command syntax;
- ensure required ticket number is present;
- detect unknown task types.

## 30.3 PreToolUse hook — implementation gate

This is the most important hook.

It MUST inspect file-write/edit operations and block source-repository modifications when:

```text
current task state < SPEC_APPROVED
```

It MUST permit writes to:

```text
tasks/<ticket-number>/
system/
repositories/<repo-name>/
```

when the workflow allows those artifacts.

It MUST block writes to registered source repositories before implementation authorization.

## 30.4 PreToolUse hook — Git policy

The Git policy hook MUST block:

- commits when branch != active ticket;
- commits without an active task;
- invalid commit messages;
- force push;
- deletion of `main`;
- destructive reset operations against protected branches;
- automatic changes outside registered repositories.

## 30.5 PreToolUse hook — dangerous operations

Block by default:

```text
production deploy
production database write
rm -rf outside approved paths
force push
history rewrite
credential extraction
secret printing
```

## 30.7 PostToolUse audit hook

Record:

- timestamp;
- task ID;
- tool/event type;
- repository;
- success/failure;
- relevant command class;
- actor/session ID if available.

Do not store secret values.

## 30.8 Stop hook

The stop hook SHOULD verify:

- no unfinished required gate is being silently abandoned;
- the task status matches the persisted state;
- failures are recorded.

It MUST NOT prevent the developer from exiting the session. Its purpose is validation/logging, not trapping the user.

---

# 31. Permissions and Safety

The implementation MUST use conservative Claude Code permissions.

`bypassPermissions` MUST NOT be the standard aisdlc mode.

The system SHOULD use:

- read-only/plan behavior during understanding and specification;
- normal interactive permissions during implementation;
- hook-enforced protection for critical boundaries;
- explicit approval for high-impact actions.

Claude Code permission evaluation and hooks can be combined so that hooks block unsafe operations while permission rules limit allowed tool use.

## 31.1 Protected paths

Protected by default:

```text
.git/
credentials/
secrets/
production configuration
workspace credentials
private key files
```

## 31.2 Secret handling

Secrets MUST:

- never be placed in task artifacts;
- never be committed by the AI-SDLC;
- never be echoed in audit logs;
- never be copied into Jira comments.

---

# 32. Impact Analysis

Impact analysis is a first-class artifact:

```text
tasks/<ticket-number>/impact-analysis.md
```

Required sections:

```markdown
# Impact Analysis

## Ticket Summary

## Affected Domains

## Directly Affected Repositories

## Indirectly Affected Repositories

## Repositories Reviewed and Excluded

## APIs / Interfaces

## Database / Data

## Events / Messaging

## Infrastructure

## Security

## Testing

## Documentation

## Deployment

## Evidence
```

Each repository must have:

```text
repository
impact classification
reason
evidence
confidence
required change: yes/no
```

The system MUST NOT modify a repository merely because it is registered.

---

# 33. API Change Workflow

For API changes:

```text
Ticket
 ↓
Impact analysis
 ↓
API contract identification
 ↓
Backward compatibility analysis
 ↓
Specification
 ↓
Approval
 ↓
Implementation
 ↓
Consumer validation
 ↓
Contract/integration tests
 ↓
Review
```

The workflow MUST identify known API consumers before modifying a breaking contract.

---

# 34. Database Change Workflow

For database changes:

```text
Ticket
 ↓
Schema impact
 ↓
Consumer analysis
 ↓
Migration strategy
 ↓
Backward compatibility
 ↓
Specification
 ↓
Approval
 ↓
Migration implementation
 ↓
Application changes
 ↓
Migration tests
 ↓
Rollback verification
 ↓
Review
```

Database changes MUST explicitly document:

- migration ordering;
- lock/availability impact;
- backward compatibility;
- rollback strategy;
- data transformation risks.

---

# 35. Bug Workflow

`/aisdlc:bug <ticket-number>` MUST NOT require a feature-sized specification by default.

It MUST produce:

```text
tasks/<ticket>/jira.md
tasks/<ticket>/impact-analysis.md
tasks/<ticket>/root-cause.md
tasks/<ticket>/validation.md
```

The bug workflow is:

```text
Get ticket
 ↓
Reproduce / understand symptom
 ↓
Trace execution path
 ↓
Form root-cause hypotheses
 ↓
Validate root cause
 ↓
Identify affected repositories
 ↓
Prepare repositories
 ↓
Implement minimal fix
 ↓
Add regression test
 ↓
Validate
 ↓
Review
 ↓
Commit
```

A bug MUST NOT be closed without regression coverage unless the test is technically impossible and an explicit waiver is recorded.

---

# 36. Investigation Workflow

Investigation tasks MUST default to read-only behavior.

```text
Ticket
 ↓
Understand symptom
 ↓
Gather evidence
 ↓
Analyze system
 ↓
Test hypotheses
 ↓
Produce findings
```

An investigation MUST NOT modify source code unless explicitly converted into an implementation task.

---

# 37. Refactor Workflow

Refactors MUST preserve documented behavior unless behavior change is explicitly part of the ticket.

Required:

- characterization of existing behavior;
- dependency/consumer analysis;
- incremental plan;
- regression tests;
- performance comparison where relevant.

---

# 38. Code Review

Code review is a comparison across three artifacts:

```text
Approved Specification
        ↓
Implementation Plan
        ↓
Actual Git Diff
```

Review must assess:

- functional correctness;
- specification compliance;
- architecture consistency;
- code quality;
- security;
- performance;
- test completeness;
- migration correctness;
- compatibility;
- observability;
- documentation impact.

For major changes, specialized review agents SHOULD run in parallel:

```text
Security reviewer
Database reviewer
API reviewer
Test reviewer
Architecture reviewer
```

---

# 39. Pull Request Workflow

A PR MAY be created only after:

```text
Implementation complete
AND
Required tests pass
AND
Code review complete
AND
Commit message compliant
```

The PR description MUST be generated from:

- Jira ticket;
- approved specification;
- impact analysis;
- implementation summary;
- validation results.

Required sections:

```markdown
## Summary

## Why

## Repositories Changed

## Technical Changes

## Database Changes

## API Changes

## Testing

## Deployment Notes

## Rollback Notes

## Related Ticket
```

---

# 40. CI Integration

CI MUST be represented in task state.

Example:

```yaml
ci:
  provider: github-actions
  status: running
  checks:
    unit: passed
    integration: passed
    lint: passed
    security: passed
    e2e: passed
```

A failed CI check transitions the task to:

```text
CI_FAILED
```

Claude may diagnose the failure.

Automatic code modification in response to CI failure MUST remain subject to the same implementation and commit rules as normal work.

---

# 41. Documentation Workflow

Documentation has two distinct lifecycle classes:

1. **Technical documentation** — API, schema, architecture, deployment, operations, repository conventions, and other engineering reference material.
2. **Product understanding documentation** — the durable description of what the product does, its capabilities, user-facing behavior, business rules, and supported workflows.

Technical documentation MAY be updated during the normal implementation workflow. Product understanding documentation is finalized by the post-release product-knowledge consolidation workflow defined in Section 42.

After implementation, the documentation skill MUST evaluate whether the following changed:

```text
API behavior
Database schema
Architecture
Data flow
Business behavior
Operational behavior
Deployment configuration
Troubleshooting guidance
Repository conventions
```

Documentation changes MUST be included in `tasks/<ticket>/documentation.md`.

Not every feature requires a system architecture update. The documentation skill MUST explicitly state whether each documentation category is:

```text
updated
not required
pending
```

---

# 42. Post-Release Product Knowledge Consolidation

Product understanding MUST be treated as a durable knowledge base rather than a permanent collection of ticket specifications. Feature-specific specifications, requirements, impact analyses, and implementation plans are working artifacts. After the feature is released to production, the final product behavior MUST be consolidated into the durable product-understanding documentation in `system/product/`.

The mandatory entry point is:

```text
/aisdlc:post-release <ticket-number>
```

The command invokes the `product-knowledge-consolidation` skill. The skill MUST execute only after production release has been verified. It MUST NOT delete any task artifacts before the product documentation has been successfully updated, validated, and committed.

## 42.1 Preconditions

Before the consolidation skill starts, all of the following MUST be true:

```text
MERGED = true
PRODUCTION_RELEASE = verified
CI = passed or explicitly accepted according to policy
IMPLEMENTATION = complete
VALIDATION = complete
TASK_STATE = RELEASED or KNOWLEDGE_CONSOLIDATION_PENDING
```

The release MUST be evidenced by one of the configured authoritative sources:

- deployment/CI-CD integration;
- release-management integration;
- production deployment record supplied by the developer through `AskUserQuestion` when no release integration exists.

A release record MUST contain at least:

```yaml
release:
  status: released
  environment: production
  reference: <deployment-or-release-reference>
  released_at: <timestamp>
  evidence_source: <integration|user-provided>
```

If production release cannot be verified, the command MUST stop in `RELEASE_PENDING`. It MUST NOT delete temporary artifacts.

## 42.2 Durable Product Understanding Location

The canonical product-understanding knowledge base MUST be stored under:

```text
system/product/
├── product-overview.md
├── feature-catalog.yaml
├── capabilities/
├── user-workflows/
├── business-rules/
└── glossary.md
```

The exact files used for a product domain MAY be expanded, but the following rules apply:

- `product-overview.md` describes the overall product and major capabilities.
- `feature-catalog.yaml` is the structured index of durable capabilities/features.
- `capabilities/` contains durable explanations of product capabilities.
- `user-workflows/` contains durable user or consumer workflows.
- `business-rules/` contains product-level business rules and constraints.
- `glossary.md` contains domain terminology used by the product.

The product knowledge base MUST describe **current product behavior**, not the implementation process that created it.

## 42.3 Consolidation Sources

The skill MUST inspect all relevant evidence before making updates:

1. `tasks/<ticket-number>/specification.md`
2. `tasks/<ticket-number>/requirements.md`
3. `tasks/<ticket-number>/impact-analysis.md`
4. `tasks/<ticket-number>/implementation-plan.md`
5. `tasks/<ticket-number>/validation.md`
6. `tasks/<ticket-number>/documentation.md`
7. the final Git diff(s) for all affected repositories;
8. the final merged commit(s);
9. production release evidence;
10. the current `system/product/` documentation.

The implementation and released behavior are the final authority for what was actually delivered. The approved specification is the authority for intended behavior where implementation evidence alone is insufficient. Jira remains the authority for the original request and acceptance criteria.

## 42.4 Standard Consolidation Procedure

The skill MUST execute the following sequence:

```text
1. Load task state
2. Verify production release
3. Load temporary feature artifacts
4. Identify affected product capabilities
5. Read current product understanding documentation
6. Compare intended behavior with released implementation
7. Identify new capabilities
8. Identify modified capabilities
9. Identify removed/deprecated capabilities
10. Identify changed user workflows
11. Identify changed business rules
12. Update feature catalog
13. Update capability documentation
14. Update user workflows
15. Update business rules
16. Update glossary when new terminology was introduced
17. Update product overview when a major capability changed
18. Remove obsolete statements
19. Run product-document consistency validation
20. Run documentation review
21. Commit durable documentation changes
22. Record consolidation result and commit hash
23. Delete temporary feature-specific artifacts
24. Verify deletion
25. Mark task COMPLETED
```

The skill MUST NOT simply copy the feature specification into the product documentation. It MUST transform the specification and implementation knowledge into durable, current product understanding.

## 42.5 New Feature Handling

When the ticket introduces a new product capability, the skill MUST:

- create or update the appropriate capability document;
- add the capability to `feature-catalog.yaml`;
- document the user/consumer workflow when applicable;
- document new business rules;
- update the product overview when the capability materially changes the product description.

Example catalog entry:

```yaml
- id: scheduled-report-generation
  name: Scheduled Report Generation
  status: active
  introduced_by: FEAT-1234
  capabilities:
    - reporting
  product_document: capabilities/reporting.md
  user_workflows:
    - user-workflows/schedule-report.md
```

## 42.6 Existing Feature Handling

When the ticket changes an existing capability, the skill MUST update the existing durable documentation rather than creating a duplicate feature document.

It MUST explicitly check for:

- changed behavior;
- changed constraints;
- changed inputs/outputs visible to users or consumers;
- changed workflow steps;
- changed eligibility or business rules;
- removed behavior;
- renamed concepts.

If a previous statement in product documentation is no longer true, it MUST be corrected or removed.

## 42.7 Implementation-vs-Specification Reconciliation

The consolidation skill MUST compare the approved specification with the released implementation.

If material differences exist, the skill MUST NOT silently document the difference. It MUST record a reconciliation result in:

```text
tasks/<ticket-number>/knowledge-consolidation.yaml
```

The result MUST classify each material difference as:

```text
implemented-as-specified
implemented-with-approved-change
implemented-differently-and-requires-clarification
not-released
```

A state of `implemented-differently-and-requires-clarification` MUST block artifact deletion and task completion.

## 42.8 Product Knowledge Quality Rules

Durable product documentation MUST:

- describe current behavior;
- avoid ticket-specific implementation history unless it is required for understanding;
- avoid repository/file-level implementation details unless they are intentionally part of product knowledge;
- avoid duplicating detailed architecture documentation;
- avoid stale or contradicted statements;
- link to authoritative technical documentation where appropriate;
- use stable capability names;
- preserve traceability to the originating ticket through structured metadata where appropriate.

The documentation MUST be understandable without access to the temporary feature specification.

## 42.9 Validation Before Deletion

Temporary feature artifacts MUST NOT be deleted until all conditions below pass:

```text
[ ] Production release verified
[ ] Product capability updates identified
[ ] New/changed product documentation written
[ ] Feature catalog updated
[ ] Product documentation consistency check passed
[ ] No unresolved reconciliation issue
[ ] Documentation review passed
[ ] Durable documentation commit created
[ ] Commit hash recorded in task state
```

## 42.10 Temporary Artifact Deletion

After successful consolidation, the following temporary feature artifacts MUST be deleted by default:

```text
tasks/<ticket-number>/jira.md
tasks/<ticket-number>/requirements.md
tasks/<ticket-number>/impact-analysis.md
tasks/<ticket-number>/knowledge-manifest.yaml
tasks/<ticket-number>/specification.md
tasks/<ticket-number>/implementation-plan.md
tasks/<ticket-number>/validation.md
tasks/<ticket-number>/code-review.md
tasks/<ticket-number>/documentation.md
tasks/<ticket-number>/repository-preparation.yaml
tasks/<ticket-number>/knowledge-consolidation.yaml
tasks/<ticket-number>/release.yaml
```

The following MUST be retained:

```text
tasks/<ticket-number>/task.yaml
tasks/<ticket-number>/approvals.yaml
tasks/<ticket-number>/execution-log.jsonl
```

The retained files MUST contain enough metadata to establish what happened without retaining the temporary implementation specification itself. `task.yaml` MUST contain the final release reference, product documentation commit hash, completion timestamp, and artifact-cleanup status.

The deletion MUST be performed through the consolidation workflow. Developers MUST NOT manually delete the specification first to bypass the consolidation gate.

## 42.11 Deletion Enforcement Hook

A `PreToolUse` hook MUST block deletion of any protected temporary artifact in `tasks/<ticket-number>/` unless:

```text
task.state == KNOWLEDGE_CONSOLIDATED
AND product documentation commit exists
AND product documentation validation passed
AND unresolved reconciliation issues == 0
```

The hook MUST deny deletion when any of these conditions is false.

## 42.12 Consolidation Commit

Product-understanding updates are changes to the AI-SDLC control-plane repository and MUST follow the global commit convention:

```text
<ticket-number>: <changes summary>
```

The consolidation workflow MUST create a dedicated documentation commit containing only the durable product-understanding changes. Temporary task-artifact deletion MUST NOT be mixed into this commit.

Example:

```text
FEAT-1234: Update product understanding for scheduled reports
```

After the consolidation commit succeeds, the workflow MUST perform cleanup as a separate Git transaction.

## 42.13 Temporary-Artifact Cleanup Commit

The cleanup commit MUST contain:

- deletion of the approved temporary task artifacts;
- updates to `task.yaml` recording consolidation and cleanup results;
- any required state/audit metadata changes.

The cleanup commit MUST also follow:

```text
<ticket-number>: <changes summary>
```

Example:

```text
FEAT-1234: Clean up temporary feature artifacts
```

## 42.14 Consolidation Result

The final task state MUST contain:

```yaml
knowledge_consolidation:
  status: completed
  product_documents_changed:
    - system/product/capabilities/reporting.md
    - system/product/feature-catalog.yaml
  consolidation_commit: abc123...
  cleanup_commit: def456...
  validated: true
  source_artifacts_deleted: true
  completed_at: 2026-10-15T12:00:00+05:45
```

The final state transition is:

```text
RELEASED
  ↓
KNOWLEDGE_CONSOLIDATION_PENDING
  ↓
KNOWLEDGE_CONSOLIDATED
  ↓
TEMPORARY_ARTIFACTS_CLEANED
  ↓
COMPLETED
```

---

# 43. Architecture Decision Records

An ADR MUST be proposed when a task introduces or materially changes:

- service boundaries;
- data ownership;
- integration patterns;
- major technology choices;
- event-driven patterns;
- storage strategy;
- security architecture;
- API compatibility strategy;
- deployment model.

The ADR skill should produce:

```text
decisions/ADR-XXXX-<slug>.md
```

Required sections:

```text
Context
Problem
Decision
Alternatives
Consequences
Status
```

---

# 44. Task Resumption and Failure Recovery

All workflows MUST be resumable.

Command:

```text
/aisdlc:resume <ticket-number>
```

The resume operation MUST:

1. read `task.yaml`;
2. inspect repository state;
3. inspect current branch for each repository;
4. compare branch against task metadata;
5. determine the last completed gate;
6. validate required artifacts;
7. continue from the first incomplete safe state.

If repository state differs from recorded state, the workflow enters:

```text
CONFLICTED
```

and stops rather than guessing.

---

# 45. Audit Trail

Each task MUST have:

```text
tasks/<ticket>/execution-log.jsonl
```

Each line is an immutable event record such as:

```json
{"timestamp":"2026-10-01T21:30:00+05:45","task":"FEAT-1234","event":"repo-prepared","repo":"backend","branch":"FEAT-1234"}
```

Events should include:

```text
task-created
ticket-loaded
ticket-fallback-used
impact-analysis-complete
repo-selected
repo-preparation-started
repo-prepared
specification-created
approval-requested
approval-granted
approval-rejected
implementation-started
test-started
test-completed
review-completed
commit-created
pr-created
ci-started
ci-completed
merged
production-release-verified
knowledge-consolidation-started
product-knowledge-updated
product-knowledge-validation-completed
consolidation-commit-created
temporary-artifacts-deleted
documentation-updated
task-completed
task-failed
```

Secrets MUST NOT be logged.

---

# 46. State Integrity

Every task artifact modification MUST update:

```yaml
updated_at
```

The task state MUST have a version number.

Example:

```yaml
state_version: 14
```

For released feature tasks, task state MUST additionally record whether product knowledge consolidation and temporary-artifact cleanup have completed. `COMPLETED` is invalid when `source_artifacts_deleted` is false for a feature task unless an explicit policy exception is recorded.

Updates MUST be serialized so two sessions cannot silently overwrite each other's task state.

The initial implementation SHOULD use an OS-level lock around task-state writes.

---

# 47. Concurrency Rules

A single active task may be resumed by another session only after validating:

- same task ID;
- expected repositories;
- current branches;
- specification version;
- implementation status.

Two sessions MUST NOT independently modify the same repository branch for the same task without explicit human coordination.

If concurrent ownership is detected, the task MUST enter:

```text
CONFLICTED
```

---

# 48. Repository Branch and Commit Rules

For every managed repository:

```text
Base branch: main
Task branch: <ticket-number>
Commit: <ticket-number>: <changes summary>
```

These rules apply to:

- backend;
- frontend;
- database;
- pipelines;
- services;
- infrastructure repositories.

A repository cannot be considered aisdlc-managed until these rules are enforceable.

---

# 49. Workspace Knowledge Refresh After Completion

The workspace maintains two different knowledge lifecycles:

1. **Technical repository knowledge** is refreshed whenever implementation changes are completed and the resulting repository state is known.
2. **Product understanding knowledge** is consolidated only after the feature has reached production and the post-release workflow has verified the released behavior.

Technical repository refresh MUST happen before the feature can be considered technically complete. Product understanding consolidation MUST happen before a released feature can be marked `COMPLETED`.

The technical knowledge refresh MUST:

1. identify architecture/code changes that affect repository knowledge;
2. update affected repository knowledge;
3. update the relationship graph if necessary;
4. update technical system documentation;
5. create/update ADRs if required;
6. mark each affected repository knowledge package current against the resulting commit SHA.

The technical refresh MUST NOT substitute for Section 42 product-knowledge consolidation.

---

--

# 50. `/aisdlc:status`

Command:

```text
/aisdlc:status
```

Must display:

- registered repositories;
- repository knowledge freshness;
- active tasks;
- task states;
- disconnected integrations;
- pending approvals;
- unresolved conflicts;
- non-compliant repositories.

Example:

```text
aisdlc Status

Repositories: 4
  backend       current
  frontend      current
  database      needs-refresh
  pipeline      current

Active tasks: 1
  FEAT-1234     awaiting-spec-approval

Integrations:
  Jira          connected
  Git hosting   connected
  CI            connected

Blocking issues:
  database knowledge stale
```

---

# 51. Command Catalog

The initial command surface is:

```text
/aisdlc:add-repo <repo-name> <repo-path>
/aisdlc:refresh-repo <repo-name>
/aisdlc:remove-repo <repo-name>
/aisdlc:status

/aisdlc:feature <ticket-number>
/aisdlc:bug <ticket-number>
/aisdlc:post-release <ticket-number>
/aisdlc:refactor <ticket-number>
/aisdlc:investigate <ticket-number>
/aisdlc:database-change <ticket-number>
/aisdlc:api-change <ticket-number>
/aisdlc:dependency-upgrade <ticket-number>
/aisdlc:documentation <ticket-number>

/aisdlc:approve <ticket-number> <gate>
/aisdlc:reject <ticket-number> <gate> <reason>
/aisdlc:resume <ticket-number>
/aisdlc:commit <ticket-number>
/aisdlc:pr <ticket-number>
/aisdlc:finish <ticket-number>
```

The primary developer workflow is intentionally simple:

```text
/aisdlc:feature FEAT-1234
```

or:

```text
/aisdlc:bug BUG-5678
```

The remaining lifecycle is driven by the workflow state.

`/aisdlc:finish <ticket-number>` is a **finalization command**, not a substitute for release or knowledge consolidation. For feature tasks it MUST reject completion unless the state is `TEMPORARY_ARTIFACTS_CLEANED`. The preferred sequence is:

```text
/aisdlc:feature FEAT-1234
... development ...
/aisdlc:post-release FEAT-1234
/aisdlc:finish FEAT-1234
```

For a feature, `/aisdlc:finish` MUST NOT delete temporary artifacts. Deletion is owned by `/aisdlc:post-release`. This separation provides a final verification point after cleanup.

---

# 52. `/aisdlc:feature` Detailed Example

Developer enters:

```text
/aisdlc:feature FEAT-1234
```

Claude performs:

```text
1. Read task policy.
2. Check Jira integration.
3. Pull FEAT-1234.
4. Save Jira snapshot.
5. Understand requirements.
6. Run impact analysis.
7. Select backend, frontend, database.
8. Prepare all three repositories.
9. Generate specification.
10. Ask for approval.
```

Claude then shows:

```text
Feature: FEAT-1234
Title: Add scheduled report generation

Repositories:
  backend
  database
  frontend

Specification created:
  tasks/FEAT-1234/specification.md

Implementation is BLOCKED until specification approval.

Approve specification?
```

After approval:

```text
11. Generate implementation plan.
12. Request plan approval if cross-repo/high-risk.
13. Implement backend.
14. Implement database migration.
15. Implement frontend.
16. Run unit tests.
17. Run integration/contract tests.
18. Run relevant cross-repo tests.
19. Run review agents.
20. Commit each repository with the required message.
21. Create PR(s).
22. Monitor CI.
23. Merge according to policy.
24. Verify production release.
25. Run `/aisdlc:post-release FEAT-1234`.
26. Update durable product understanding.
27. Validate product documentation.
28. Commit product knowledge updates.
29. Delete temporary feature specification and analysis artifacts.
30. Commit cleanup and mark the task complete.
```

The final product documentation becomes the durable source of product understanding; `tasks/FEAT-1234/specification.md` and other temporary task artifacts are not retained after successful consolidation.

---

# 53. Example `workspace.yaml`

```yaml
workspace:
  name: company-ai-sdlc
  version: 1
  developer_mode: interactive
  base_branch_policy: main
  task_root: tasks
  repository_root: repositories
  system_root: system
  audit_log: logs/audit.jsonl

integrations:
  jira:
    required_for_ticket_fetch: false
    adapter: mcp
  git_hosting:
    provider: configured-per-environment
  ci:
    provider: configured-per-environment

git:
  base_branch: main
  task_branch_format: "{ticket}"
  commit_format: "{ticket}: {summary}"
  include_untracked_in_stash: true
  auto_pop_stash: false
  allow_force_push: false

approvals:
  feature_specification: required
  major_feature_plan: required
  merge: human-controlled
  production_deployment: disabled

autonomy:
  repository_read: allowed
  repository_write_after_gate: allowed
  commit: workflow-controlled
  push: policy-controlled
  create_pr: policy-controlled
  production_write: disabled
```

---

# 54. Example `policies.yaml`

```yaml
safety:
  protected_branches:
    - main
  block_force_push: true
  block_history_rewrite: true
  block_production_write: true
  block_secret_logging: true

feature:
  require_specification: true
  require_spec_approval: true
  require_plan_for_cross_repo: true
  require_plan_for_database_change: true
  require_plan_for_api_change: true

bug:
  require_regression_test: true
  require_plan_for_cross_repo: true

repository:
  require_main_branch: true
  require_clean_task_branch: true
  stash_untracked: true
  stash_auto_pop: false

commit:
  format: "{ticket}: {summary}"
  max_subject_length: 120
  body_allowed: false
```

---

# 55. Example `repositories.yaml`

```yaml
repositories:
  backend:
    path: ../company-backend
    role: backend-service
    base_branch: main
    domains:
      - reporting
      - authentication
    depends_on:
      - database
    provides:
      - rest-api
    deployment:
      platform: aws

  frontend:
    path: ../company-frontend
    role: frontend-application
    base_branch: main
    domains:
      - reporting
    depends_on:
      - backend
    provides:
      - web-ui
    deployment:
      platform: aws

  database:
    path: ../company-database
    role: database
    base_branch: main
    domains:
      - reporting
    depends_on: []
    provides:
      - relational-schema
```

---

# 56. Example Repository Knowledge Package

`repositories/backend/repository.yaml`:

```yaml
name: backend
role: backend-service
path: ../company-backend
analyzed_commit: 4a97d3b
status: current

technology:
  languages:
    - python
  frameworks:
    - fastapi

entrypoints:
  - src/main.py

provides:
  - rest-api

depends_on:
  - database

domains:
  - reporting
  - authentication

testing:
  profile: testing.md

deployment:
  profile: build-release.md
```

---

# 57. Definition of Done

A feature is complete only when all of the following are true:

```text
[ ] Jira requirements captured
[ ] Requirements understood
[ ] Impact analysis complete
[ ] Affected repositories identified
[ ] Repositories prepared from main
[ ] Ticket branches created
[ ] Specification created
[ ] Specification approved
[ ] Implementation plan completed
[ ] Required plan approval completed
[ ] Implementation completed
[ ] Required tests passed
[ ] Regression coverage added
[ ] Cross-repository validation complete
[ ] AI code review complete
[ ] Security review complete where applicable
[ ] Commit messages compliant
[ ] PR created if workflow requires it
[ ] CI passes
[ ] Technical documentation impact resolved
[ ] ADR created/updated where required
[ ] Repository knowledge refreshed
[ ] PR merged
[ ] Production release verified
[ ] Product-knowledge consolidation completed
[ ] Durable product documentation validated
[ ] Consolidation commit recorded
[ ] Temporary feature-specific artifacts deleted by the consolidation workflow
[ ] Cleanup commit recorded
[ ] Task audit log complete
[ ] Final completion gate passed
[ ] Task marked completed
```

A bug is complete only when:

```text
[ ] Jira details captured
[ ] Root cause confirmed
[ ] Affected repositories identified
[ ] Repositories prepared
[ ] Fix implemented
[ ] Regression test added
[ ] Required tests passed
[ ] Review complete
[ ] Commit compliant
[ ] PR/CI complete where required
[ ] Merge/release complete where required
[ ] Technical documentation impact resolved
[ ] Product-knowledge update completed if user-visible/product behavior changed
[ ] Task audit log complete
[ ] Task marked completed
```

---

# 58. Non-Negotiable Invariants

The following additional invariant applies to released feature tasks:

> **A feature task MUST NOT be marked `COMPLETED` while its released behavior has not been consolidated into the durable product-understanding knowledge base.**

The following is also mandatory:

> **Temporary feature specification and analysis artifacts MUST NOT be deleted before product-knowledge consolidation has passed validation and the durable documentation commit has succeeded.**


The following are never optional in a managed aisdlc workflow:

1. A task must have a ticket number.
2. A feature must have an approved specification before implementation.
3. The affected repository list must exist before source changes.
4. Managed repositories must start from updated `main`.
5. The task branch must exactly equal the ticket number.
6. Commits must follow `<ticket-number>: <changes summary>`.
7. Invalid commit messages must be blocked.
8. Claude must not guess missing critical ticket information.
9. Repository knowledge must identify its source commit.
10. Investigation tasks must remain read-only unless promoted.
11. Production writes are disabled by default.
12. Workflow state must be persisted.
13. Workflow conflicts must stop execution instead of being guessed through.
14. Audit records must never contain secrets.

---

# 59. Implementation Order

Implementation should be delivered in phases.

## Phase 1 — Control Plane

Implement:

- workspace repository;
- configuration;
- task schemas;
- repository registry;
- basic CLAUDE.md;
- logging framework.

## Phase 2 — Repository Intelligence

Implement:

- `/aisdlc:add-repo`;
- standardized repository study;
- standardized testing study;
- repository knowledge artifacts;
- provenance;
- refresh logic.

## Phase 3 — Core Workflow

Implement:

- Jira adapter;
- Jira fallback interaction;
- `/aisdlc:feature`;
- `/aisdlc:bug`;
- impact analysis;
- feature specification;
- approval state.

## Phase 4 — Git Governance

Implement:

- repository preparation;
- branch creation;
- commit skill;
- Git policy hooks;
- task-aware source write gate.

## Phase 5 — Validation and Review

Implement:

- test skill;
- validation artifacts;
- review agents;
- security review;
- CI integration.

## Phase 6 — Delivery

Implement:

- PR skill;
- documentation skill;
- ADR skill;
- technical repository knowledge refresh;
- production-release verification;
- product-knowledge-consolidation skill;
- `/aisdlc:post-release`;
- protected temporary-artifact cleanup;
- final `/aisdlc:finish` gate.

## Phase 7 — Advanced Autonomy

Implement only after the first six phases are stable:

- automated PR updates;
- controlled CI auto-fixes;
- worktree-based parallel task execution;
- deeper dependency graphing;
- automated architecture drift detection;
- organization-wide plugin distribution.

---

# 60. Acceptance Test Suite for AI-SDLC

The implementation is not accepted until the following scenarios pass.

## A. Add repository

```text
/aisdlc:add-repo backend ../backend
```

Expected:

- repository registered;
- knowledge package created;
- testing profile created;
- no source changes.

## B. Jira connected

```text
/aisdlc:feature FEAT-1234
```

Expected:

- Jira ticket retrieved;
- task created;
- impact analysis created;
- repositories identified;
- branches prepared;
- specification created;
- implementation blocked pending approval.

## C. Jira disconnected

```text
/aisdlc:feature FEAT-1234
```

Expected:

- interactive ticket questions appear;
- no guessed requirements;
- task source marked `user-provided`;
- workflow continues after required details are supplied.

## D. Feature without approval

Attempt to edit application source before spec approval.

Expected:

```text
BLOCKED
Reason: Feature specification has not been approved.
```

## E. Branch protection

Attempt to edit/commit on `main`.

Expected:

```text
BLOCKED
Reason: Active aisdlc task requires branch FEAT-1234.
```

## F. Invalid commit

Attempt:

```text
git commit -m "add scheduled reports"
```

Expected: blocked.

## G. Valid commit

Attempt:

```text
git commit -m "FEAT-1234: Add scheduled report generation"
```

Expected: allowed when other commit gates pass.

## H. Diverged main

If `main` cannot fast-forward from origin, workflow stops for human resolution.

## I. Existing branch

If `FEAT-1234` already exists without an active task record, workflow stops instead of overwriting it.

## J. Ticket changes after approval

If Jira changes materially after specification approval, implementation becomes blocked until the specification is reapproved.

## K. CI failure

CI failure moves the task to a failed CI state and records the failing checks.

## L. Resume

After an interrupted session, `/aisdlc:resume FEAT-1234` continues from the last valid state.

## M. Production release required

Attempt `/aisdlc:post-release FEAT-1234` before production release is verified.

Expected:

```text
BLOCKED
Reason: Production release has not been verified.
Temporary feature artifacts retained.
```

## N. Product knowledge consolidation

After production release is verified, run `/aisdlc:post-release FEAT-1234`.

Expected:

- current product documentation is inspected;
- new/changed capabilities are identified;
- `system/product/` is updated;
- product-document validation passes;
- a documentation consolidation commit is created;
- temporary task specification artifacts are deleted only after the consolidation commit succeeds;
- a cleanup commit is created;
- retained task metadata records both commit hashes;
- task state becomes `TEMPORARY_ARTIFACTS_CLEANED`.

## O. Premature specification deletion

Attempt to delete `tasks/FEAT-1234/specification.md` before successful product-knowledge consolidation.

Expected: blocked by the cleanup `PreToolUse` hook.

## P. Specification is not copied verbatim

Run consolidation where implementation differs from the specification.

Expected:

- the discrepancy is recorded;
- the durable product docs reflect verified released behavior only;
- unresolved material discrepancies block cleanup.

## Q. Finish gate

Attempt `/aisdlc:finish FEAT-1234` while product-knowledge consolidation or cleanup is incomplete.

Expected:

```text
BLOCKED
Reason: Post-release knowledge consolidation is incomplete.
```

---

# 61. Future Enhancements

These are deliberately not required for the first production release:

- Git worktrees for simultaneous tasks;
- automatic repository topology visualization;
- semantic code graph / indexed symbol graph;
- architecture drift scoring;
- automated stale-document detection;
- dependency vulnerability intelligence;
- release orchestration;
- automated changelog generation;
- deployment approvals;
- production observability integration;
- multi-team workspace federation;
- analytics on defect escape rate, review findings, cycle time, and AI contribution.

---

# 62. Final Operating Model

The intended developer experience is:

```text
Developer
    │
    ├── /aisdlc:add-repo backend ../backend
    ├── /aisdlc:add-repo database ../database
    ├── /aisdlc:add-repo frontend ../frontend
    │
    └── /aisdlc:feature FEAT-1234
                    │
                    ▼
             Jira / user input
                    │
                    ▼
              Understanding
                    │
                    ▼
              Impact analysis
                    │
                    ▼
              Repo selection
                    │
                    ▼
       stash → main → pull → branch
                    │
                    ▼
             Feature specification
                    │
                    ▼
              HUMAN APPROVAL
                    │
                    ▼
            Implementation plan
                    │
                    ▼
               Implementation
                    │
                    ▼
               Test + Review
                    │
                    ▼
        <ticket>: <changes summary>
                    │
                    ▼
                  PR / CI
                    │
                    ▼
             Technical Docs
                    │
                    ▼
              Merge / Release
                    │
                    ▼
          /aisdlc:post-release
                    │
                    ▼
       Product Knowledge Consolidation
                    │
                    ▼
        Durable Product Documentation
                    │
                    ▼
         Delete Temporary Task Docs
                    │
                    ▼
              Cleanup Commit
                    │
                    ▼
          /aisdlc:finish <ticket>
                    │
                    ▼
                COMPLETED
```

The central architectural rule is:

> **AI performs the analysis, planning, implementation, validation, and documentation; the aisdlc framework controls state, safety, evidence, and approvals.**

This makes Claude Code the AI execution layer while the aisdlc workspace becomes the engineering governance and orchestration layer.

---

# 63. Official Claude Code Capability References

The implementation should be kept aligned with current Claude Code documentation, because Claude Code capabilities and extension mechanisms evolve.

The design above relies on these current concepts:

- Skills are reusable, on-demand capabilities and can be packaged in `SKILL.md` files.
- Subagents provide isolated contexts for specialized work.
- Hooks can be triggered deterministically by lifecycle/tool events and can enforce policies by allowing or blocking tool calls.
- MCP connects Claude Code to external systems such as issue trackers.
- Permission rules and permission modes provide another control layer.
- Plugins package skills, subagents, hooks, and MCP integrations and provide namespacing.

Primary reference: Anthropic Claude Code documentation and Anthropic Claude Code guidance on steering Claude Code with CLAUDE.md, rules, skills, hooks, subagents, MCP, and plugins.

---

# 64. Implementation Completion Criterion

The AI-SDLC implementation is considered complete for version 1.0 only when:

1. A developer can work entirely from the central aisdlc workspace.
2. No repository-specific manual `claude init` step is required.
3. `/aisdlc:add-repo` creates standardized repository and test knowledge.
4. `/aisdlc:feature <ticket>` can execute the full feature lifecycle.
5. Jira fallback works without guessing.
6. Feature implementation is technically blocked before specification approval.
7. All affected repositories are prepared consistently.
8. Branch naming is deterministic.
9. Commit messages are deterministically validated.
10. Repository-specific testing approaches are explicitly known.
11. Task state survives session interruption.
12. Audit records allow reconstruction of what occurred.
13. Knowledge has provenance and freshness.
14. Unsafe Git/production operations are blocked.
15. The workflow can resume after recoverable failures.
16. Human approvals are persisted and enforceable.
17. The same process can be reused by every developer on the team.

**End of specification.**
