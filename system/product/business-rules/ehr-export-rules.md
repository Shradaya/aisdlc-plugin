---
business_rules: ehr-export-rules
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [services/v2/hl7job.service.js:110-141, services/v2/hl7job.service.js:290-305, services/v2/hl7job.service.js:372, util/v2/report.v2.util.js:118-140, util/constants.js:836, services/v2/apiJob.v2.service.js:115-208, developer answers 2026-10-02]
---

# EHR Export Rules

Capability: [EHR Export: HL7, SFTP and API Jobs](../capabilities/ehr-export-hl7-sftp-api-jobs.md). Workflow: [Export a report to an EHR](../user-workflows/export-report-to-ehr.md). Developer confirmed these rules on 2026-10-02.

## 1. Which jobs a report is eligible for

- ORU: the report has an alert or warning flag, a billing date, or is explicitly non-billable.
- DFT: the report has a billing date, is not a preliminary export, and is not a resend for a clinic that prohibits DFT resends after completion.
- IDCO: the report came from an HL7 transmission, has an alert, billing date or non-billable flag, and is not a preliminary export.
A job type is exported only when the account enables it.
Evidence: services/v2/hl7job.service.js:110-132, 262-275; util/v2/report.v2.util.js:118-140.

## 2. Job statuses and reuse

Job statuses are pending, completed, error and timeout. When a job is requested, an existing pending job for the same report and type is reused instead of creating a new one. A failed publish sets the job and report status to error; marking complete sets completed.
Evidence: util/constants.js:836; services/v2/hl7job.service.js:134-160; repository/v2/hl7Job.v2.repository.js:58.

## 3. Account must be enabled and accessible

The account must have at least one of ORU, DFT or IDCO enabled and the user must have access to the report account. A retried job type must still be eligible.
Evidence: services/v2/hl7job.service.js:276-305, 372.

## 4. Intergy API job conditions

The account must be an Intergy account; the report needs an alert or a billing date (in-office reports need a billing date); the patient needs first name, last name and date of birth; an EHR provider must resolve and a task label must resolve for the billing code. If the job cannot be queued it is removed.
Evidence: services/v2/apiJob.v2.service.js:115-245.

## Open questions

- The Intergy job account name is fixed in code (apiJob.v2.service.js:220), which suggests it works for one client only; intended behavior is unknown (observed defect, see repositories/rest-api-evoke/security.md for code-level notes).
- SFTP export applies to accounts with the SFTP setting and signed reports with an alert or billing date (sftp.v2.service.js:14-100, transmissions.js:335); not in the confirmed list.
- Terminology (inferred): hl7job, ORU, DFT, IDCO, ADT; see the glossary. Which application produces ADT records is unknown.
- Legacy v1 endpoints remain mounted; whether the front end uses them is unknown.
