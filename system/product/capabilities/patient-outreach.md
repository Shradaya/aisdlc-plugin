---
capability: patient-outreach
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [services/v2/twilio.v2.service.js, services/v2/zoom.v2.service.js:20-120, services/v2/patient.v2.service.js:2674-3030, services/v2/patient.v2.service.js:4290-4360, services/v2/live_call_task.v2.service.js:20-70, services/v2/no_show_letter.v2.service.js:140-200, services/v2/transmission.v2.service.js:1395-1680, developer answers 2026-10-02]
---

# Patient Outreach

## What it does today

Evoke contacts patients about transmissions and follows up when devices stop reporting.

- **Reminders:** each patient has subscription settings (letter, calls, SMS, channels, pause window or removal). Reminders are sent by the Twilio reminders Lambda; the API records delivery statuses from Twilio callbacks and asks the Lambda to retry with the next contact number after a failed step.
- **Opt-out and opt-in:** a patient texting STOP or UNSUBSCRIBE, or START, UNSTOP or SUBSCRIBE, changes the phone number's opt-out state; staff are alerted on Slack.
- **Live calls:** staff log calls to patients (manual, or from Zoom phone events) and create follow-up live-call tasks; tasks can be completed manually with a reason.
- **Letters:** status letters and report letters are mailed through PostGrid after address verification (a report letter can be cancelled before the cutoff); no-show letters are generated from a template and emailed.
- **Letter templates and exports:** letter templates are managed per account; lists of reminder, overdue and no-show patients can be downloaded.

Workflow: [Patient outreach](../user-workflows/patient-outreach.md). Rules: [Outreach rules](../business-rules/outreach-rules.md).

## Implemented by

| Repository | Role |
|---|---|
| rest-api-evoke | Subscription settings, callback ingestion, opt-out, live-call tasks, letters, templates |
| twilio-reminders-lambda (not onboarded) | Sends reminders and retries |
| Third-party services | Twilio (SMS and voice), Zoom (call events), PostGrid (letters), SES (email) |

## Customer visibility

Customer-visible (human-confirmed 2026-10-02).

## Open questions

See the Open questions of [Outreach rules](../business-rules/outreach-rules.md#open-questions).
