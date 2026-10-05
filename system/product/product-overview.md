# Product Overview

<!-- Durable description of what the product does. Maintained by /aisdlc:post-release (product-knowledge-consolidation).
     Describe current behavior only; no ticket history or implementation detail. -->

Provenance: baseline documentation added when `manufacturer-hl7-parser` was onboarded (commit e185ff36fe03c649cd7e9750e895c8c43f857c43, 2026-10-01, aisdlc@1.0.0), extended on 2026-10-05 with `patient-billing-schedule` (commit ec1d8894c633996d7fc9e7a9423d21521a981bf6, aisdlc@1.0.0), extended on 2026-10-02 with `rest-api-evoke` (commit 4178ce47396c524dfd22a4dd107927b3b28eb100, analyzed 2026-10-01T17:57:10Z, aisdlc@1.0.0). Only repositories onboarded so far are covered, so this overview is incomplete for the product as a whole.

## Product Summary

Evoke handles remote monitoring of patients with implanted cardiac devices. The part documented first is the data intake: transmissions from Abbott, Biotronik, Boston Scientific and Medtronic arrive as HL7 files and are automatically turned into patient transmission reports with PDFs, pre-written clinical notes and alert flags, billing codes and schedules, and follow-up work for billing and partner systems.

A back-end billing scheduler (`patient-billing-schedule`, no end users; developer-confirmed 2026-10-05) decides which report of each billing window is billable and on which date, keeps next-send and late dates, creates follow-up tasks for late patients and sets long-inactive patients inactive.

Staff work with those reports in the Evoke clinician web portal (`evoke-portal-front-end`, a browser application onboarded 2026-10-02 at commit 79953d33432479d03bcde9545050dbb9a7193ed8). Beyond report review, the portal gives staff and clinics patient lists and profiles, a Remote Patient Monitoring view, no-show patient follow-up, tasks, billing reference data, a dashboard with notifications, configuration screens and in-app calling and letters; which screens a user sees depends on their role. Its back end, `rest-api-evoke`, is used by clinic staff, physicians and Evoke staff to review, annotate, sign and assign reports, upload transmissions manually or from in-office device files, enrol and manage patients and devices, configure alerts, manage billing and RPM, export reports to client EHRs (HL7, SFTP, API jobs), contact patients, and administer users and accounts. All of these capabilities are customer-visible (developer-confirmed 2026-10-02).

## Major Capabilities

| Capability | Repositories | Document |
|---|---|---|
| Device Transmission Report Ingestion | manufacturer-hl7-parser, rest-api-evoke | [capabilities/device-transmission-report-ingestion.md](capabilities/device-transmission-report-ingestion.md) |
| Automated Report Notes and Alerts | manufacturer-hl7-parser, rest-api-evoke | [capabilities/automated-report-notes-and-alerts.md](capabilities/automated-report-notes-and-alerts.md) |
| Billing Code and Schedule Assignment | manufacturer-hl7-parser, rest-api-evoke, patient-billing-schedule | [capabilities/billing-code-and-schedule-assignment.md](capabilities/billing-code-and-schedule-assignment.md) |
| Billing Window Scheduling | patient-billing-schedule, manufacturer-hl7-parser, rest-api-evoke | [capabilities/billing-window-scheduling.md](capabilities/billing-window-scheduling.md) |
| Patient and Device Registration | manufacturer-hl7-parser, rest-api-evoke, patient-billing-schedule | [capabilities/patient-and-device-registration.md](capabilities/patient-and-device-registration.md) |
| Report Review, Notes and Assignment | rest-api-evoke | [capabilities/report-review-notes-and-assignment.md](capabilities/report-review-notes-and-assignment.md) |
| EHR Export: HL7, SFTP and API Jobs | rest-api-evoke | [capabilities/ehr-export-hl7-sftp-api-jobs.md](capabilities/ehr-export-hl7-sftp-api-jobs.md) |
| Patient Outreach | rest-api-evoke | [capabilities/patient-outreach.md](capabilities/patient-outreach.md) |
| Access and Account Administration | rest-api-evoke, evoke-portal-front-end | [capabilities/access-and-account-administration.md](capabilities/access-and-account-administration.md) |
| Patient Management and Remote Patient Monitoring | evoke-portal-front-end, rest-api-evoke, manufacturer-hl7-parser, patient-billing-schedule | [capabilities/patient-management-and-rpm.md](capabilities/patient-management-and-rpm.md) |
| Task Management (internal) | evoke-portal-front-end, rest-api-evoke | [capabilities/task-management.md](capabilities/task-management.md) |
| Billing Management (internal) | evoke-portal-front-end, rest-api-evoke | [capabilities/billing-management.md](capabilities/billing-management.md) |
| Administration and Configuration | evoke-portal-front-end, rest-api-evoke | [capabilities/administration-and-configuration.md](capabilities/administration-and-configuration.md) |
| Dashboard and Notifications | evoke-portal-front-end, rest-api-evoke | [capabilities/dashboard-and-notifications.md](capabilities/dashboard-and-notifications.md) |
| Patient Communication (internal) | evoke-portal-front-end, rest-api-evoke | [capabilities/patient-communication.md](capabilities/patient-communication.md) |

Workflows: [Run the billing schedule](user-workflows/run-billing-schedule.md) (inferred), [Process a Device Transmission](user-workflows/process-device-transmission.md), [Review and sign a report](user-workflows/review-and-sign-report.md), [Manual and in-office upload](user-workflows/manual-and-in-office-transmission-upload.md), [Enrol and manage a patient](user-workflows/enrol-patient.md), [Configure and use alerts](user-workflows/configure-alerts.md), [Bill, export to Benchmark and invoice RPM](user-workflows/bill-and-export.md), [Export a report to an EHR](user-workflows/export-report-to-ehr.md), [Patient outreach](user-workflows/patient-outreach.md), [Sign in and manage access](user-workflows/sign-in-and-manage-access.md), [Review transmissions in the portal](user-workflows/review-transmissions-in-portal.md) (inferred), [Follow up no-show patients](user-workflows/follow-up-no-show-patients.md) (inferred), [Monitor RPM patients](user-workflows/monitor-rpm-patients.md) (inferred).

Rules: [Transmission processing rules](business-rules/transmission-processing-rules.md), [Report review](business-rules/report-review-rules.md), [Transmission intake](business-rules/transmission-intake-rules.md), [Patient management](business-rules/patient-management-rules.md), [Alerts](business-rules/alert-rules.md), [Billing and RPM](business-rules/billing-and-rpm-rules.md), [Billing windows](business-rules/billing-window-rules.md), [EHR export](business-rules/ehr-export-rules.md), [Outreach](business-rules/outreach-rules.md), [Access](business-rules/access-rules.md), [Portal access and roles](business-rules/portal-access-rules.md), [Portal tasks and statuses](business-rules/portal-task-and-status-rules.md).

Terms: [glossary](glossary.md). System picture: [system-overview](../architecture/system-overview.md).

## Open questions

- Whether any application other than the portal presents reports, tasks and billing to staff is not known.
- The portal's capabilities task management, billing management and patient communication were classified internal from role evidence; Clinic Admins can reach some of these screens, so a customer-facing part may exist (not confirmed).
- Portal workflows are inferred from route and tab names; the developer did not supply step lists. The realtime socket service the portal uses is not onboarded.
- The customer-visibility of the manufacturer-hl7-parser capabilities was proposed as internal; the developer confirmed the rest-api-evoke contributions to the same capabilities as customer-visible, so the combined capability is customer-visible.
- Billing Window Scheduling: how account batch runs are triggered and the product meaning of its terms (ideal billing date, billing window, backbill, next send, late date) are unconfirmed; see its capability document.
- Open questions per capability are listed at the end of each business-rules document.
