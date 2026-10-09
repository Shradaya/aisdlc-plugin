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

## Contribution of client-emr-hl7-parser (added 2026-10-09)

Provenance: client-emr-hl7-parser @ b9615126ee17c4e2583e08ac81faaa9d12c63005, analyzed 2026-10-09T00:00:00Z, aisdlc@1.0.0; status observed (roles confirmed by the developer 2026-10-09); confidence medium. Evidence: src/eventHandler/oru.py, dft.py, idco_oru.py, src/accountHandler/, src/database/query.py, src/utils/aws.py.

The HL7 content of an export is built here, per client account.

- **ORU:** a result message carrying the signed report, built for the account's format (the report as embedded text or as a PDF with a cover page, depending on the account). The message is stored in the processed bucket under `orus/`.
- **DFT:** a billing-charge message, available for Denver Health, Toledo, Grand Heart, UCH and Pueblo. Stored under `dfts/`.
- **IDCO ORU:** discrete device data taken from the manufacturer's original HL7 file, available for UCH and Pueblo only; for other accounts the request fails with "IDCO ORU not implemented for the clinic". Stored under `orus/`.
- The request fails when the matching HL7 job or report documents do not exist, and failures are reported to Slack.
- Delivery of the stored files to the client EMR is done by a separate service (client-ehr-hl7-export, not onboarded).

Workflow: [Export a report to an EHR](../user-workflows/export-report-to-ehr.md). Rules: [EMR message handling rules](../business-rules/emr-message-handling-rules.md).

## Implemented by

| Repository | Role |
|---|---|
| rest-api-evoke | Eligibility, job creation and status, SNS/SQS publishing, SFTP staging, API jobs |
| client-emr-hl7-parser | Builds the ORU, DFT and IDCO ORU HL7 messages per client account and stores them in S3 |
| client-ehr-hl7-export (not onboarded; name unconfirmed) | Delivers the stored HL7 files to the client EHR (developer-confirmed 2026-10-09); earlier documentation described it as the consumer of the published job |
| intergy-api-job-consumer (not onboarded) | Consumes API-job messages |
| sftp-export-consumer (not onboarded) | Consumes SFTP export messages |

## Customer visibility

Customer-visible (human-confirmed 2026-10-02).

## Open questions

See the Open questions of [EHR export rules](../business-rules/ehr-export-rules.md#open-questions) and of [EMR message handling rules](../business-rules/emr-message-handling-rules.md#open-questions).

- The trigger that turns a published HL7 job into a creation request for the parser is unnamed (not client-ehr-hl7-export).
- Which accounts receive which message type beyond the lists above is account-specific and not described here field by field.
