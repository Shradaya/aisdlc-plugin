---
business_rules: report-review-rules
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [services/v2/transmission.v2.service.js:295, services/v2/transmission.v2.service.js:436-492, services/v2/transmission.v2.service.js:301-352, services/v2/transmission.v2.service.js:1254, services/v2/notes.v2.service.js:65, services/v2/notes.v2.service.js:70-90, util/v2/billingCode.v2.util.js:168, common/constant.js:112-128, developer answers 2026-10-02]
---

# Report Review Rules

Capability: [Report Review, Notes and Assignment](../capabilities/report-review-notes-and-assignment.md). Workflow: [Review and sign a report](../user-workflows/review-and-sign-report.md). Developer confirmed these rules on 2026-10-02.

## 1. Signed reports are locked

A signed report cannot have its Evoke notes or clinic notes changed (a FIN-only update is allowed for clinic notes). To change it, it must be unsigned first, and Assistants may not unsign reports.
Evidence: services/v2/transmission.v2.service.js:295, 1254; services/v2/notes.v2.service.js:65, 100-109.

## 2. The billing date must follow the billing code cycle

A billing date saved on a report must not be earlier than the next eligible date: 91 days for 93294, 93295 and 0578T; 31 days for 93297, 93298 and 93264. The first billing counts from the date of implant (offsets 31 for 93294, 93295, 0578T and 93264; 61 for 93297; 15 for 93298); later billings count from the last billing date for that code (or from the last signature for accounts configured that way). Otherwise the save is refused with a "must follow a N-day cycle" message.
Evidence: services/v2/transmission.v2.service.js:436-492; util/v2/billingCode.v2.util.js:168-238; common/constant.js:112-128; util/constants.js:510-524.

## 3. Signing is limited by report state and hospital

A report can be signed only while it is in Clinic Active or Clinic For Review. A user restricted to assigned hospitals can sign only reports of patients in those hospitals.
Evidence: services/v2/notes.v2.service.js:70-90.

## 4. Alerts go only where the account allows

Alert notifications sent from a report can use only an alert type, notification method, time period and recipients present in the account alert configuration.
Evidence: services/v2/transmission.v2.service.js:301-352.

## Open questions

Observed in code but not confirmed by the developer (not product rules yet):
- For the account named Denver Heart, signing requires physician notes (notes.v2.service.js:42).
- A physician can be assigned only if their accounts include the report account (and the patient account when also assigned to the patient) (transmission.v2.service.js:1722-1765). The role of the report_assignments collection is unverified (only name syncing was seen).
- Whether approving a patient note deletion request actually deletes the note is unverified; approval stores the reviewer and notifies the requester (patient_note_deletion_requests.v2.service.js:34-62), and any status string is accepted by the validator.
- Report tab names (Evoke active, processed, archived; clinic active, for review, processed) are inferred from field names (inferred).
- Role meanings (Assistant, Clinic Reviewer, Clinic Admin) are inferred from role constants and route permissions (inferred).
- Legacy v1 endpoints remain mounted next to the v2 endpoints; whether the front end still uses them is unknown.
