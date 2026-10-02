---
workflow: export-report-to-ehr
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [services/v2/hl7job.service.js:110-471, services/transmissions.js:330-440, services/v2/sftp.v2.service.js:14-100, services/v2/apiJob.v2.service.js:90-309, services/v2/adt.v2.service.js, developer answers 2026-10-02]
---

# Export a Report to an EHR

Consumers: clinic users, Admin, Clinic Admin. Steps confirmed by the developer on 2026-10-02.

## Steps

1. When a report is processed or signed (or a user retries it, singly or in bulk), the API checks account access, that the account has HL7 export enabled, and which job types the report is eligible for.
2. It builds the cover page, creates (or reuses the pending) ORU, DFT and IDCO jobs, sets the report's export status, and publishes the job to the client EHR HL7 export.
3. Admin and Clinic Admin review the job list, edit, retry, mark complete or delete jobs; failures also alert Slack.
4. SFTP accounts: a signed report with an alert or billing date is staged as a PDF for the SFTP export consumer.
5. Intergy accounts: a job with the report note is queued; jobs are listed, retried, marked complete or deleted.
6. ADT records for a patient can be searched by MRN and downloaded.

Capability: [EHR Export: HL7, SFTP and API Jobs](../capabilities/ehr-export-hl7-sftp-api-jobs.md).
Rules: [EHR export rules](../business-rules/ehr-export-rules.md).

## Open questions

See the Open questions of the EHR export rules.
