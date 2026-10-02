---
business_rules: transmission-intake-rules
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [services/v2/manual_upload.v2.service.js:167-385, services/v2/manual_upload.v2.service.js:285-306, services/v2/manual_upload.v2.service.js:998-1030, services/v2/patient.v2.service.js:1611-1640, controllers/bodyTrace.js:11-27, developer answers 2026-10-02]
---

# Transmission Intake Rules

Capability: [Device Transmission Report Ingestion](../capabilities/device-transmission-report-ingestion.md). Workflow: [Manual and in-office upload](../user-workflows/manual-and-in-office-transmission-upload.md). Developer confirmed these rules on 2026-10-02.

## 1. Account and manufacturer access

The account must be supported, the manufacturer supported, and both must be in the access lists of the uploading user; otherwise the upload is refused.
Evidence: services/v2/manual_upload.v2.service.js:167-199.

## 2. The patient must exist, be active and match the account

For an existing patient, the patient must exist (otherwise the user must mark it as a new patient), be active, and belong to the selected account (with the UCH clinic group and cross-facility in-office exceptions). Device information must be present.
Evidence: services/v2/manual_upload.v2.service.js:330-400.

## 3. Billing code limits

Only one main billing code may be sent per upload; additional codes are required or forbidden according to the billing type; a billing date requires billing code and diagnosis code; the billing date must not already be on another report of the patient; RPM code 99453 can be reported once per patient (twice when an additional manufacturer is involved).
Evidence: services/v2/manual_upload.v2.service.js:203-327.

## 4. A duplicate new patient is rejected and the file deleted

A new patient matching an existing patient by name, date of birth and device is rejected (the response reports the existing patient) and the uploaded file is removed.
Evidence: services/v2/patient.v2.service.js:1611-1640; services/v2/manual_upload.v2.service.js:998-1030.

## 5. BodyTrace readings need exactly one active patient

A BodyTrace reading is stored only when its device IMEI resolves to exactly one active patient; none or several returns 422.
Evidence: controllers/bodyTrace.js:11-27, 103-117.

## Open questions

- Clinii webhook behavior (known facility required, Demo account refused in production, only patient-create and transmission-create events) is observed in clinii.service.js:345-405 but was not in the confirmed list.
- In-office parsing by file extension (.xml, .bnk, .log, .23x) is described in the workflow; no rule beyond the extension mapping was confirmed.
- Manual upload leaves no database rollback after a mid-sequence failure (only the file is deleted); whether this is intended is unknown.
- Legacy v1 endpoints remain mounted; whether the front end uses them is unknown.
