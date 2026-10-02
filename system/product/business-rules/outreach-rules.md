---
business_rules: outreach-rules
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [services/v2/patient.v2.service.js:2920-3030, services/v2/patient.v2.service.js:4322-4335, services/v2/patient.v2.service.js:4567-4605, services/v2/patient.v2.service.js:2693-2707, services/v2/twilio.v2.service.js:36-70, services/v2/twilio.v2.service.js:176-195, services/v2/transmission.v2.service.js:1411-1433, services/v2/transmission.v2.service.js:1625-1650, developer answers 2026-10-02]
---

# Outreach Rules

Capability: [Patient Outreach](../capabilities/patient-outreach.md). Workflow: [Patient outreach](../user-workflows/patient-outreach.md). Developer confirmed these rules on 2026-10-02.

## 1. Communication status and phone types

A patient communication status is off when removed or not subscribed, paused when today falls within the pause window, otherwise on. When only one channel is enabled, the patient must have a phone number of a matching type: SMS needs a mobile or non-fixed VoIP number; calls need a landline, toll-free or fixed VoIP number.
Evidence: services/v2/patient.v2.service.js:2946-2995, 4567-4605.

## 2. Opt-out keywords

A text of STOP or UNSUBSCRIBE opts the phone number out; START, UNSTOP or SUBSCRIBE opts it back in. Repeated requests have no effect, and staff are alerted on Slack.
Evidence: services/v2/twilio.v2.service.js:36-70, 235-289.

## 3. Reminder retry

After a failed, undelivered, no-answer or busy reminder, the reminders Lambda is asked to retry with the next contact number only while the current step is below 2.
Evidence: services/v2/twilio.v2.service.js:176-195.

## 4. Live-call follow-ups

At most 3 failed follow-up attempts can be logged against one live-call task; after that the task must be marked complete.
Evidence: services/v2/patient.v2.service.js:4335; common/constant.js:497.

## 5. Letter conditions

A letter cannot be sent when it was already sent, when the patient has no street address, or when the file is not a PDF. A report letter also needs Benchmark insurance and a complete address (street, city, state, zip). A report letter can be cancelled only before the cutoff: an ASAP order before midnight Eastern the next day, or a scheduled order before its send date. A no-show email needs a valid patient email and an existing template.
Evidence: services/v2/patient.v2.service.js:2693-2707; services/v2/transmission.v2.service.js:1411-1445, 1625-1650; services/v2/no_show_letter.v2.service.js:148-185.

## Open questions

- Zoom call logging only runs when enabled in configuration, and the callee number must map to an active patient (zoom.v2.service.js:38-55); not in the confirmed list.
- The Scheduling feature mounted at the root is a per-account interval list; its product meaning is unknown.
- Which application sends the SMS and call reminders beyond the Twilio reminders Lambda, and the reminder schedule, are not in this repository.
- Legacy v1 endpoints remain mounted; whether the front end uses them is unknown.
