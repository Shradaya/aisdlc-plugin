---
workflow: patient-outreach
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [services/v2/twilio.v2.service.js, services/v2/zoom.v2.service.js, services/v2/patient.v2.service.js:2674-3030, services/v2/patient.v2.service.js:4290-4360, services/v2/live_call_task.v2.service.js, services/v2/no_show_letter.v2.service.js, services/v2/transmission.v2.service.js:1395-1680, developer answers 2026-10-02]
---

# Patient Outreach

Consumers: Evoke staff and clinic users (subscription settings, letters, live calls); patients (SMS replies). Steps confirmed by the developer on 2026-10-02.

## Steps

1. Staff set a patient's subscription: letter, calls, SMS, channels, and a pause window or removal.
2. The Twilio reminders Lambda sends reminders; Twilio callbacks update the delivery log, and a failed step triggers a retry with the next contact number.
3. A patient replying STOP, UNSUBSCRIBE, START, UNSTOP or SUBSCRIBE changes the number's opt-out state and staff are alerted.
4. Staff log live calls (manual or Zoom-originated) and create or complete follow-up tasks.
5. Staff send a status letter or report letter (PostGrid, after address verification) or a no-show letter (emailed from a template); a report letter can be cancelled before the cutoff.
6. Staff download reminder, overdue and no-show patient lists.

Capability: [Patient Outreach](../capabilities/patient-outreach.md).
Rules: [Outreach rules](../business-rules/outreach-rules.md).

## Open questions

See the Open questions of the outreach rules.
