---
business_rules: patient-management-rules
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [services/v2/patient.v2.service.js:560-720, services/v2/patient.v2.service.js:1611-1640, services/v2/patient.v2.service.js:1986, services/v2/patient.v2.service.js:2332, util/v2/patient.v2.util.js:1123, developer answers 2026-10-02]
---

# Patient Management Rules

Capability: [Patient and Device Registration](../capabilities/patient-and-device-registration.md). Workflow: [Enrol and manage a patient](../user-workflows/enrol-patient.md). Developer confirmed these rules on 2026-10-02.

## 1. Late date

A patient late date is the next send date plus 3 days; clearing next send clears it.
Evidence: services/v2/patient.v2.service.js:676.

## 2. Next send and next billing date

The next send date cannot be changed unless the patient has a billing cycle (an active implanted schedule or a supplied billing schedule). When the next billing date is changed, it must equal the next send date.
Evidence: services/v2/patient.v2.service.js:591-620.

## 3. Insurance and IDTF

Insurance information cannot be edited for a self-pay patient. The IDTF status of a patient can be changed only for accounts with SPLIT billing.
Evidence: services/v2/patient.v2.service.js:1986, 2332.

## 4. Enrolment

Enrolling a patient checks for an existing patient with the same name, date of birth, device model and serial number and refuses a duplicate (the message says whether it exists in the account of the user or another). A new enrolment creates a NEW PATIENT onboarding task.
Evidence: services/v2/patient.v2.service.js:1611-1640; util/v2/patient.v2.util.js:1123-1138; services/v2/patient.v2.service.js:1761-1778.

## Open questions

Observed, not confirmed as product rules:
- A patient is reactivated automatically when a report is saved with a billing date, alert or non-billable flag (transmission.v2.service.js:572-590).
- Device groups need a unique name and a device belongs to one group (device_group.v2.service.js:71, 79); manufacturer account names are unique and passwords need at least 8 characters (manufacturer_accounts.v2.service.js:130, 138).
- A completed live-call task cannot be logged against or completed again (patient.v2.service.js:4322; live_call_task.v2.service.js:55).
- Merging patients is Admin-only and warns on Slack when benchmark IDs differ (patient.v2.service.js:3561 onward).
- Deactivation stores a reason and reactivation clears it (patient.v2.service.js:2351-2360).
- In production, a next-send change queues a message to the crawler bot; a queue failure leaves the update saved and returns an error message (patient.v2.service.js:696-720).
- Terminology (inferred): next_send, late_date, evoke_id, IDTF/INVOICE/SPLIT, non-enrolled patient; see the glossary.
- Legacy v1 endpoints remain mounted; whether the front end uses them is unknown.
