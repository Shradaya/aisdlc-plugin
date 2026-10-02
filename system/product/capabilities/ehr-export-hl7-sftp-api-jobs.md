---
capability: ehr-export-hl7-sftp-api-jobs
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [services/v2/hl7job.service.js, services/transmissions.js:330-440, services/v2/sftp.v2.service.js:14-100, services/v2/apiJob.v2.service.js:90-250, services/v2/adt.v2.service.js, developer answers 2026-10-02]
---

# EHR Export: HL7, SFTP and API Jobs

## What it does today

Signed or processed reports are exported to client electronic health record (EHR) systems.

- **HL7 jobs:** for accounts with HL7 export enabled, the API creates ORU (PDF result), DFT (billing charge) and IDCO (discrete device data) jobs for a report and publishes the job to the client EHR HL7 export. Jobs are created automatically when a report is processed or signed, or on demand (retry, bulk).
- **Job management:** Admin and Clinic Admin list, filter, edit, retry, mark complete and delete HL7 jobs; clinic users can retry from a report.
- **ADT:** inbound ADT (admit/discharge/transfer) records are matched to the report to fill encounter data; ADTs can be searched by MRN and downloaded.
- **SFTP export:** for SFTP accounts, a signed report with an alert or billing date is exported as a PDF to a per-account folder for the SFTP export consumer.
- **API jobs (Intergy):** for Intergy accounts a job carrying the report note is queued to the Intergy API-job consumer; jobs are listed, retried, marked complete or deleted.

Workflow: [Export a report to an EHR](../user-workflows/export-report-to-ehr.md). Rules: [EHR export rules](../business-rules/ehr-export-rules.md).

## Implemented by

| Repository | Role |
|---|---|
| rest-api-evoke | Eligibility, job creation and status, SNS/SQS publishing, SFTP staging, API jobs |
| client-ehr-hl7-export (not onboarded) | Consumes the published HL7 job and sends it to the client EHR |
| intergy-api-job-consumer (not onboarded) | Consumes API-job messages |
| sftp-export-consumer (not onboarded) | Consumes SFTP export messages |

## Customer visibility

Customer-visible (human-confirmed 2026-10-02).

## Open questions

See the Open questions of [EHR export rules](../business-rules/ehr-export-rules.md#open-questions).
