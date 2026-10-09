---
workflow: enrol-patient
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [services/v2/patient.v2.service.js:1528-1800, services/v2/patient.v2.service.js:4008-4130, services/v2/patient.v2.service.js:560-720, services/v2/patient.v2.service.js:2920-3030, util/v2/patient.v2.util.js:1123, developer answers 2026-10-02]
---

# Enrol and Manage a Patient

Consumers: clinic and Evoke staff. Steps confirmed by the developer on 2026-10-02.

## Steps

1. Staff enrol a new patient (or pick one from the non-enrolled list); the system checks for duplicates, generates an Evoke ID and serial number, and computes next send, late date and the billing schedule.
2. A NEW PATIENT onboarding task is created, and Benchmark, Clinii and CardioOne syncs are triggered where the account is set up for them.
3. Staff maintain the profile: demographics, physicians, insurance, leads, medications, documents, notes, communication logs, anticoagulation, subscription settings, activation or deactivation with a reason.
4. Staff adjust next send and next billing date; the crawler bot is told of the change in production.
5. Admin merges duplicate patients by Evoke ID and manages devices, device groups and manufacturer accounts.

Patients can also arrive without staff action from client EMR messages, which create or update the patient and (for inbound results) the NEW PATIENT onboarding task: [Receive patient messages from a client EMR](receive-patient-messages-from-emr.md).

Capability: [Patient and Device Registration](../capabilities/patient-and-device-registration.md).
Rules: [Patient management rules](../business-rules/patient-management-rules.md).

## Open questions

See the Open questions of the patient management rules.
