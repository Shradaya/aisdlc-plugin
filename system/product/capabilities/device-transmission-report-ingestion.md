---
capability: device-transmission-report-ingestion
analyzed_commit: e185ff36fe03c649cd7e9750e895c8c43f857c43
analyzed_repository: manufacturer-hl7-parser
analyzed_at: 2026-10-01T17:37:23Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [main.py:26-103, src/processor.py, src/manufacturer/__init__.py, src/delay_message_processing.py, developer answers 2026-10-01]
---

# Device Transmission Report Ingestion

## What it does today

When a cardiac implantable device sends a remote-monitoring transmission, the manufacturer's data arrives at Evoke as an HL7 `ORU^R01` file. This capability turns each file into a transmission report for the patient, with the manufacturer's PDF report attached, so it is available to the rest of the Evoke applications. Four manufacturers are supported: Abbott, Biotronik, Boston Scientific and Medtronic.

For each transmission it:

1. Accepts the file (arriving from the file-sync service via S3 or SQS) and checks it is an `ORU^R01` message.
2. Skips it if the same transmission was already processed (see business rule "Duplicate transmissions are skipped").
3. Identifies the clinic account and manufacturer, and the device model with its billing and diagnosis codes.
4. Finds or creates the patient (see Patient and Device Registration).
5. Extracts the manufacturer's PDF report (and, where applicable, an HF-only extract) and stores it for the report.
6. Saves the report, its notes and analytics in one step so a partial result is not left behind.
7. Triggers the follow-up systems: the billing schedule, the Benchmark queue for new patients, and CardioOne for CardioOne accounts.

Abbott implantable loop recorder (ILR) reports that are not summary reports are deferred before processing (see business rule "Abbott ILR reports are delayed").

## What operators see when something goes wrong

- Unreadable file or wrong message type: the file is copied to a dated error folder and the development Slack channel is alerted.
- Account not found, unidentified device model, report PDF missing, patient name missing for a new patient, device mismatch, duplicate patient: a Slack notice is sent (development channel; business channel for report-not-found, missing name and duplicate-patient notices) and the transmission is not turned into a report where the notice says so.
- Unexpected errors: Slack alert with details, and the processing run fails so the trigger's retry behavior applies.

## Contribution of rest-api-evoke (added 2026-10-02)

Provenance: rest-api-evoke @ 4178ce47396c524dfd22a4dd107927b3b28eb100, analyzed 2026-10-01T17:57:10Z, aisdlc@1.0.0; status human-confirmed (developer answers 2026-10-02); confidence high.

The portal back end adds two further intake paths and shares the report data with the pipeline:
- **Manual upload:** clinic and Evoke users upload a manufacturer PDF with patient, device, billing and note details; the API validates, creates or updates the patient, creates the report in the Evoke active tab and updates billing history. Report data can be pre-extracted from the PDFs.
- **In-office upload:** a device file (Abbott `.log`, Biotronik `.xml`, Boston Scientific `.bnk`, Medtronic `.23x`) is parsed to prefill patient and device data and to find the existing patient.
- **Remote monitoring intake:** BodyTrace blood-pressure and weight readings and Clinii patients and transmissions are stored for RPM patients.

evoke-portal-front-end calls the upload routes (`/upload`, see [Administration and Configuration](administration-and-configuration.md)); third-party webhook senders (BodyTrace, Clinii) call the intake routes.

Customer visibility (supersedes the inferred "internal" statement below): customer-visible, human-confirmed 2026-10-02.
Workflows: [manual and in-office upload](../user-workflows/manual-and-in-office-transmission-upload.md). Rules: [transmission intake rules](../business-rules/transmission-intake-rules.md).

## Contribution of manufacturer-crawler: Transmission Alert Capture and Biotronik Export

Provenance: manufacturer-crawler @ d6aa388a03c12e777846a704818ba5903a021a4f, analyzed 2026-10-15T08:55:00Z, aisdlc@1.0.0; status observed; confidence medium (evidence: `manufacturer/Medtronic_Carelink/trackAlert.py`, `manufacturer/Abbott_Merlin/transmission_crawler.py`, `manufacturer/Biotronik/biotronik.py`, `eventHandler/cron_job.py`, `database/updateDocument.py`; developer answers 2026-10-15).

After a report exists, a back-end bot (`manufacturer-crawler`, no end users) enriches the transmission with data from the manufacturer's portal:

- **Alert capture (Medtronic and Abbott):** the bot reads the portal's alert priority and description for the transmission and stores them on the stored report and on that day's HF report as `transmission_alert_information`. Reports of the last 24 hours are swept; after a transmission is handled it is marked viewed and dismissed in the portal.
- **Biotronik export:** on the patient's due date the bot exports the patient's report from the Biotronik portal to the EMR, but only when the portal holds a transmission newer than the last export. Each export is recorded in `biotronik_exported_reports` (owned by the crawler, developer-confirmed). See [Manufacturer portal sync rules](../business-rules/manufacturer-portal-sync-rules.md).

The crawler does not create reports and does not download or parse report files; reports are created by manufacturer-hl7-parser.

Customer visibility: internal (proposed, status: inferred; not confirmed by the developer).

Open questions for this contribution: which screens display `transmission_alert_information` is unknown; Boston Scientific alert capture was not audited in detail; why only Medtronic and Abbott capture alerts is unknown.

Known gap: related technical capability for retrieving disconnected monitors exists; it is deliberately kept out of product documentation (technical knowledge only, see `repositories/manufacturer-crawler/interfaces.md`).

## Implemented by

| Repository | Role |
|---|---|
| manufacturer-crawler | Transmission alert capture (Medtronic, Abbott) and Biotronik export from the manufacturer portals (back-end bot Lambda); see [architecture](../../../repositories/manufacturer-crawler/architecture.md) |
| rest-api-evoke | Manual upload, in-office file parsing, BodyTrace and Clinii intake (portal back end) |
| manufacturer-hl7-parser | Report creation (the HL7 pipeline; sole implementation of that part): Lambda pipeline (`main.py`, `src/processor.py`, `src/manufacturer/*`, `hl7/*`, `pdf/*`) |

Upstream (not onboarded, developer-confirmed): manufacturer adapters on Windows EC2 and a custom file-sync service that copies files to S3. See `system/architecture/system-overview.md`.

## Customer visibility

Internal pipeline capability; its output (reports, PDFs) appears in other Evoke applications. Visibility was proposed as internal and not contradicted (status: inferred).

## Open questions

- Which Evoke application(s) display these reports and PDFs, and who consumes the stored PDF paths? Unknown.
- Why Abbott ILR reports are delayed and for how long (queue settings are not in the repository). Unknown.
- Expected processing time or service level. Unknown.
