---
capability: administration-and-configuration
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_repository: evoke-portal-front-end
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/containers/AppPage/index.js (/settings, /account-configurations, /report-templates, /ehr-jobs/*, /reports-assignment, /upload, /archived-reports), src/pages/settings/useSettings.js, src/pages/accountConfiguration, src/pages/reportTemplates, src/components/Hl7Jobs, developer answers 2026-10-02]
---

# Administration and Configuration

## What it does today

Administrators and clinic administrators configure how the portal and the reports behave.

- **Settings (`/settings/:view`):** users, devices, manufacturer accounts, quick-text templates, and letter templates; reachable by Admin, Clinic Admin and RPM-only users, plus clinic and physician roles when the account enables quick-text templates (tabs are further gated in the page).
- **Account configurations (Admin only):** account preferences, alert notification settings and alert protocols.
- **Report templates (`/report-templates/:view`):** report templates, note templates and device groups for User, Admin, Assistant and Clinic Admin.
- **EHR jobs (Admin, Clinic Admin):** HL7 jobs and API jobs lists with retry, update and bulk processing (see [EHR Export](ehr-export-hl7-sftp-api-jobs.md)).
- **Reports assignment:** interval assignment of reports for one customer clinic (visible only for the clinic named Centra).
- **Manual report upload and archived reports:** upload of transmission reports by Admin, User and Clinic Admin (and clinic roles an account allows); archived reports list and downloads for Admin, Physician, Clinic Admin and Clinic (see [Device Transmission Report Ingestion](device-transmission-report-ingestion.md)).
- **Per-account switches:** account settings can show or hide features (e.g. quick-text templates, only-assigned reports).

## Implemented by

| Repository | Role |
|---|---|
| evoke-portal-front-end | Configuration, template, EHR-job and upload screens |
| rest-api-evoke | The configuration APIs and data |

## Customer visibility

Customer-visible (developer-confirmed 2026-10-02) for the clinic-scoped parts; the Admin-only account configurations are Evoke staff screens (route evidence).

## Open questions

- The portal hard-codes behavior for named customer clinics (e.g. Centra); the product-level meaning is not documented.
- The purpose of the `evoke.lcwms.co` embed allowed in the CSP is unknown.
