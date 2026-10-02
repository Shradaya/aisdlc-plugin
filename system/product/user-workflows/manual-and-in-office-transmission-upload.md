---
workflow: manual-and-in-office-transmission-upload
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [services/v2/manual_upload.v2.service.js:974-1030, services/v2/in_office.v2.service.js:10-45, util/v2/inOffice/inOfficeDocumentParser.v2.util.js:15-33, controllers/bodyTrace.js:5-98, services/rpm/clinii/clinii.service.js:345-405, developer answers 2026-10-02]
---

# Manual and In-office Transmission Upload, and RPM Intake

Consumers: Clinic, Physician, Clinic Admin, Admin and User roles (manual upload); Admin, User and Clinic Admin (in-office); BodyTrace and Clinii as senders. Steps confirmed by the developer on 2026-10-02.

## Steps

1. Optional: the user submits manufacturer PDFs to prefill note values from configured page titles.
2. Manual upload: the API validates the account, manufacturer and access, the patient (or new-patient details), device, billing codes and dates, RPM devices and assigned physician.
3. The patient is created or updated, the report is created in the Evoke active tab with alert flags from the severity, and the upload record, billing history, implanted schedule, report notes and analytics are saved.
4. In-office: the user uploads a device file (`.xml`, `.bnk`, `.log`, `.23x`); the API parses patient and device data, finds the existing patient by name and date of birth, and reports whether the user has access to the clinic named in the file; similar patients can be searched.
5. BodyTrace: blood-pressure and weight readings are stored against the patient found by device IMEI.
6. Clinii: patient-create and transmission-create events create the patient or report.

Capabilities: [Device Transmission Report Ingestion](../capabilities/device-transmission-report-ingestion.md), [Patient and Device Registration](../capabilities/patient-and-device-registration.md).
Rules: [Transmission intake rules](../business-rules/transmission-intake-rules.md).

## Open questions

See the Open questions of the transmission intake rules.
