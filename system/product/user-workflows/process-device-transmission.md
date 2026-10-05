---
workflow: process-device-transmission
analyzed_commit: e185ff36fe03c649cd7e9750e895c8c43f857c43
analyzed_repository: manufacturer-hl7-parser
analyzed_at: 2026-10-01T17:37:23Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [main.py:26-103, src/processor.py, developer answers 2026-10-01]
---

# Process a Device Transmission

Consumer: an automated flow, not an end user. The developer accepted the pipeline steps below as the workflow.

## Steps

1. A manufacturer adapter (Windows EC2) receives a transmission and stores the HL7 file locally; the file-sync service copies it to S3.
2. The S3 event, or an SQS message from the DLQ, invokes the pipeline Lambda with the file location.
3. The pipeline loads and parses the file; non-`ORU^R01` or unreadable files go to the error folder with a Slack alert.
4. A transmission whose control id already exists is skipped.
5. The clinic account, manufacturer and device model are identified, with billing and diagnosis codes.
6. Abbott ILR non-summary transmissions arriving from S3 are queued for delayed processing and picked up again from the queue.
7. The patient is matched or created (a name is required for new patients) and device consistency is checked.
8. Billing codes and dates are calculated; the manufacturer PDF is extracted and stored.
9. The report (and an HF report when applicable), its automated notes, alert flags and analytics are saved together.
10. Follow-ups run: billing schedule run ([patient-billing-schedule](run-billing-schedule.md)), Benchmark event for new IDTF patients, CardioOne job for CardioOne accounts, a new-patient task for new patients, removal of the patient's live-call task.

Capabilities involved: [Device Transmission Report Ingestion](../capabilities/device-transmission-report-ingestion.md), [Automated Report Notes and Alerts](../capabilities/automated-report-notes-and-alerts.md), [Billing Code and Schedule Assignment](../capabilities/billing-code-and-schedule-assignment.md), [Patient and Device Registration](../capabilities/patient-and-device-registration.md).
Rules: [Transmission processing rules](../business-rules/transmission-processing-rules.md).

## Open questions

- Retry and redelivery policy for failed runs (trigger and DLQ settings are not in the repository). Unknown.
