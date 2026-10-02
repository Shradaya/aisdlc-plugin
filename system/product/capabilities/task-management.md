---
capability: task-management
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_repository: evoke-portal-front-end
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/containers/AppPage/index.js (/tasks*), src/pages/tasks, src/containers/Tasks, src/app/services/task/taskService.js, src/static/constants.js:62-116, developer answers 2026-10-02]
---

# Task Management

## What it does today

Evoke staff and Clinic Admins track follow-up work as tasks in the portal.

- **Views:** active tasks (`/tasks`), archived, automated (scheduling), audited, audited-archived, and pending approvals (note-deletion requests awaiting approval). Reachable by User, Admin, Assistant and Clinic Admin roles.
- **Status:** a task is `To Do`, `In Progress`, `Blocked` or `Complete`; tasks can be created, edited, archived and deleted, and are linked to a patient and optionally a report.
- **Approvals:** pending note-deletion requests are approved or declined from the pending-approvals view; notifications are exchanged through the notifications channel.

Rules: [Portal task and status rules](../business-rules/portal-task-and-status-rules.md).

## Implemented by

| Repository | Role |
|---|---|
| evoke-portal-front-end | Task screens and filters |
| rest-api-evoke | Task and note-deletion-request APIs and data |
| manufacturer-hl7-parser | Creates tasks such as "new patient" (shared database) |

## Customer visibility

Internal (proposed from route evidence, accepted by the developer 2026-10-02). Clinic Admins can also reach the task views, so a customer-facing part is possible; not confirmed.

## Open questions

- What "audited" and "automated" tasks mean in product terms is inferred from names.
- Who creates automated tasks beyond the parser's new-patient task is not established here.
