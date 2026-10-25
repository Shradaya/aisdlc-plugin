# Documentation Workflow

Reference for `/aisdlc-dev:documentation` and the documentation stage of other workflows (spec §41, §42, §49). Procedure: `skills/documentation/SKILL.md`. Task type `documentation` uses the `feature` lifecycle (`workflows/feature.md`).

## Two lifecycle classes

1. Technical documentation (API, schema, architecture, deployment, operations, repository conventions): may be updated during normal implementation and by technical knowledge refresh after implementation.
2. Product-understanding documentation (`system/product/`): finalized only by post-release product-knowledge consolidation (`/aisdlc-dev:post-release`). The documentation skill never edits it.

## Categories evaluated after implementation

API behavior; Database schema; Architecture; Data flow; Business behavior; Operational behavior; Deployment configuration; Troubleshooting guidance; Repository conventions. Each is recorded in `tasks/<ticket>/documentation.md` as `updated`, `not required` (with reason) or `pending`.

## Documentation-type tasks

The feature lifecycle applies, including specification approval and post-release consolidation, because `${CLAUDE_PLUGIN_ROOT}/config/task-types.yaml` maps `documentation` to it. The `documentation-reviewer` agent assesses impact from requirement, code and tests only.
