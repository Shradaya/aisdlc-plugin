---
workflow: follow-up-no-show-patients
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_repository: evoke-portal-front-end
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: inferred
confidence: low
evidence: [src/containers/AppPage/index.js (/no-show-patients*), src/pages/liveCallTasks/LiveCallTaskItem.js, src/pages/nonCompliantPatients, src/app/services/patient/nonCompliantPatients.js, src/static/constants.js (LIVE_CALL_STATUS, MIN_ATTEMPTS_FOR_MANUAL_LIVE_CALL_TASK_COMPLETE)]
---

# Follow Up No-Show Patients

Inferred from routes and constants; unconfirmed. Evoke Admin and User roles only.

## Steps (inferred)

1. Open `/no-show-patients` and pick a month, year, account and schedule type to list patients who did not transmit, with their reminder history.
2. Open `/no-show-patients/live-call-tasks` to see call tasks (status to do, needs follow-up, or completed).
3. Call the patient through the embedded Zoom Phone; call events are logged on the patient (see [Patient Communication](../capabilities/patient-communication.md)).
4. After repeated attempts a task in "needs follow-up" can be completed manually with a reason and date (see rule in [Portal task and status rules](../business-rules/portal-task-and-status-rules.md)).
5. Patients not yet enrolled appear under `/no-show-patients/non-enrolled-patients` and can be enrolled.
6. An overdue-patients list can be downloaded.

Capability: [Patient Management and RPM](../capabilities/patient-management-and-rpm.md).
