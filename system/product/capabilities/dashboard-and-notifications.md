---
capability: dashboard-and-notifications
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_repository: evoke-portal-front-end
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/containers/AppPage/index.js (/dashboard), src/components/pages/dashboard, src/app/services/dashboard, src/app/services/notification, src/hooks/useSocket.js, src/static/constants.js (socket namespaces), developer answers 2026-10-02]
---

# Dashboard and Notifications

## What it does today

- **Dashboard (`/dashboard`):** analytics for User, Admin, Clinic, Physician, Assistant, Clinic Admin and Clinic Reviewer: patient, transmission and billable-interval counts for a date range and account, manufacturer and device breakdowns, account and patient-compliance analytics, revenue, doctors (with CSV download), surgery types (spreadsheet download), and report presence (who is viewing a report).
- **Notifications:** a notification list with unread count; items can be marked read individually or all at once. A realtime channel refreshes the list when something new arrives, and notification preferences let users choose what they receive.
- **Report presence:** while a report is open the portal tells the realtime service, so other users see who is viewing it.
- **Realtime availability:** realtime features are switched on only in the Pre Production and Production builds.

## Implemented by

| Repository | Role |
|---|---|
| evoke-portal-front-end | Dashboard and notification screens, realtime client |
| rest-api-evoke | Dashboard and notification APIs |
| Realtime socket service (not onboarded; repository not named) | Report presence, notifications and transcription channels |

## Customer visibility

Customer-visible (developer-confirmed 2026-10-02).

## Open questions

- Which metrics clinics see versus Evoke staff is not documented here; the API may scope them.
- Which events create notifications beyond note-deletion approvals is not established.
- Realtime behavior in Development and QA builds is off by configuration.
