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

## HL7 message creation (back-end steps, added 2026-10-09)

Source: client-emr-hl7-parser @ b9615126ee17c4e2583e08ac81faaa9d12c63005, observed from code, aisdlc@1.0.0; the caller is a trigger fed by the HL7 job topic (developer-confirmed 2026-10-09).

1. A creation event (ORU, DFT or IDCO ORU) arrives with a report id.
2. The HL7 job and report documents for that report are read; if missing, the request fails and Slack is alerted.
3. The portal account name is matched to a client account handler ([EMR message handling rules](../business-rules/emr-message-handling-rules.md)).
4. The account handler builds the HL7 message (for ORU, the report embedded as text or as a PDF merged with its cover page; for IDCO ORU, from the manufacturer's original HL7 file, restoring it from archive first when needed, in which case the request fails and must be retried later).
5. The message is stored in the processed bucket (`orus/` or `dfts/`) and the storage paths are returned.
6. A separate delivery service sends the stored file to the client EMR (client-ehr-hl7-export, not onboarded).

Capability: [EHR Export: HL7, SFTP and API Jobs](../capabilities/ehr-export-hl7-sftp-api-jobs.md).
Rules: [EHR export rules](../business-rules/ehr-export-rules.md).

## Open questions

See the Open questions of the EHR export rules and of the [EMR message handling rules](../business-rules/emr-message-handling-rules.md#open-questions). The trigger between the HL7 job topic and the parser is unnamed (unknown).
