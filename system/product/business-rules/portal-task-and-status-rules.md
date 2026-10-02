---
business_rules: portal-task-and-status-rules
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_repository: evoke-portal-front-end
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: medium
evidence: [src/static/constants.js:86-116,1889-1916, src/pages/liveCallTasks/LiveCallTaskItem.js:24-36, developer answers 2026-10-02]
---

# Portal Task and Status Rules

The developer confirmed on 2026-10-02 that these code-observed rules are correct and worth documenting. Capabilities: [Task Management](../capabilities/task-management.md), [Patient Management and RPM](../capabilities/patient-management-and-rpm.md), [Report Review](../capabilities/report-review-notes-and-assignment.md).

- **Task status:** a task is To Do, In Progress, Blocked or Complete.
- **Report alert severity:** None, Warning or Critical, ranked 0, 1 and 2 (shown green, yellow and red) so that higher severity sorts first.
- **Live-call tasks:** a live-call task has status to do, needs follow-up or completed. A task in "needs follow-up" can be marked complete manually only after at least 3 call attempts; manually completed tasks are shown highlighted.

## Open questions

- Whether severity ranking also drives alert notification routing is documented on the API side ([Alert rules](alert-rules.md)).
