---
capability: patient-and-device-registration
analyzed_commit: e185ff36fe03c649cd7e9750e895c8c43f857c43
analyzed_repository: manufacturer-hl7-parser
analyzed_at: 2026-10-01T17:37:23Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/processor.py:264-295, src/processor.py:410-478, src/processor.py:538-619, src/database/query.py, developer answers 2026-10-01]
---

# Patient and Device Registration

## What it does today

Transmissions are matched to the patient they belong to, and patients and devices are created or updated automatically.

- **Matching:** a patient is first looked up by device serial number; if none is found, by first name, last name and date of birth. A match by name and date of birth with a different serial is treated as a generation change (the patient has a new device).
- **New patients:** if no patient matches, a new patient is created from the message (this requires a patient name; without one, the transmission is not turned into a report and the business Slack channel is notified). New patients get an Evoke ID of the form `EMC` followed by eight digits, and a "new patient" task is created for staff to update demographics.
- **Device checks:** the device model in the message must match the patient's stored device, a previous device or a secondary device, or the patient name must match; otherwise the transmission is rejected with a Slack alert. Unknown device models whose device type is known are added to the device list automatically; unknown lead models are added to the lead list.
- **Live call tasks:** each processed transmission removes the patient's open live-call task.
- **CardioOne:** for accounts in CardioOne, a job record is created and a `FETCH_RHYTHM_ID` event with the job id is queued.

## Contribution of rest-api-evoke (added 2026-10-02)

Provenance: rest-api-evoke @ 4178ce47396c524dfd22a4dd107927b3b28eb100, analyzed 2026-10-01T17:57:10Z, aisdlc@1.0.0; status human-confirmed (developer answers 2026-10-02); confidence high.

The portal back end is where staff manage patients after they exist:
- **Enrolment:** enrol a new patient or a non-enrolled patient; an Evoke ID is generated and a NEW PATIENT onboarding task is created; Benchmark, Clinii and CardioOne syncs are triggered.
- **Management:** profile, insurance (including self-pay and pre-auth), physicians, leads, medications, documents, notes, tasks, communication logs, next send and billing schedule, anticoagulation, activation and deactivation, merging duplicate patients (Admin).
- **Devices:** device and device-group catalogues and manufacturer accounts (Admin and Clinic Admin).

the crawler bot (manufacturer-crawler) receives next-send updates; Benchmark and CardioOne consumers receive patient events.

Customer visibility (supersedes the inferred "internal" statement below): customer-visible, human-confirmed 2026-10-02.
Workflows: [enrol a patient](../user-workflows/enrol-patient.md). Rules: [patient management rules](../business-rules/patient-management-rules.md).

## Contribution of patient-billing-schedule (added 2026-10-05)

Provenance: patient-billing-schedule @ ec1d8894c633996d7fc9e7a9423d21521a981bf6, analyzed 2026-10-05, aisdlc@1.0.0; status human-confirmed (developer answers 2026-10-05); confidence high. Evidence: src/database/schedule.py:108-121, src/database/schedule.py:365-374.

During a billing run, an active patient with no report for 730 days (about two years) is set inactive with the reason "No Longer Monitoring". Rule: [Billing window rules](../business-rules/billing-window-rules.md).

## Implemented by

| Repository | Role |
|---|---|
| rest-api-evoke | Patient enrolment and management, devices, device groups, manufacturer accounts (portal back end) |
| manufacturer-hl7-parser | Matching, creation, device validation, task creation and queue events |
| patient-billing-schedule | Sets patients inactive when they have had no report for 730 days |
| cardio-one-sqs-consumer (not onboarded) | Receives the CardioOne job event (behavior not documented here) |

Patient, device, lead and task records live in a shared MongoDB owned by other repositories (owners not named).

## Customer visibility

Internal; patients and tasks appear in other Evoke applications (status: inferred).

## Open questions

- Which application staff use to work the "new patient" and live-call tasks. Unknown.
- Product rules for merging or retiring the old record after a generation change (the pipeline only flags a possible duplicate patient). Unknown.
