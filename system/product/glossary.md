# Glossary

<!-- Domain terminology used by the product. Add a term when a released feature introduces new terminology. -->

Provenance: manufacturer-hl7-parser @ e185ff36fe03c649cd7e9750e895c8c43f857c43, 2026-10-01, aisdlc@1.0.0. Terms the developer did not define stay "Definition not confirmed"; the "Used in code" column is evidence, not a definition.

| Term | Definition | Used in code | Status |
|---|---|---|---|
| Transmission | A remote-monitoring data upload from an implanted cardiac device, delivered by its manufacturer as one HL7 `ORU^R01` file | One file = one processed transmission (`main.process`) | observed |
| Control id | The HL7 message identifier (`MSH-10`) used to recognize a transmission already processed | Compared with `reports.oruControlId` | observed |
| Evoke ID | Patient identifier generated for new patients: `EMC` followed by eight digits | Counter in `sequencers` | observed |
| HF report | Definition not confirmed | A second report with its own billing code and notes (`hf_billing_code`, `-HF` control-id suffix) | unknown |
| ILR | Definition not confirmed | Device type; Abbott ILR is the only delay rule | unknown |
| IDTF | Definition not confirmed | Account billing classification that selects the code mapping; also controls Benchmark events | unknown |
| Generation change | Definition not confirmed | Patient matched by name and date of birth but with a new device serial number; flagged as duplicate patient | unknown |
| Initial report tab | Definition not confirmed | Per-account setting (`regular`, `hf`) that decides which reports are created | unknown |
| Summary report | Definition not confirmed | Detected from the message; Abbott ILR summary reports are not delayed | unknown |

## Terms from rest-api-evoke

Provenance: rest-api-evoke @ 4178ce47396c524dfd22a4dd107927b3b28eb100, 2026-10-01T17:57:10Z, aisdlc@1.0.0. All definitions below are written from how the code uses each term and are **inferred**, not confirmed by the developer. "Generation change" is a parser term not found in this repository and is not defined here.

| Term | Definition (inferred from code use) | Used in code | Status |
|---|---|---|---|
| next_send / last_send | The scheduled date of the next expected transmission and the date of the last one; next send can be edited by staff and, in production, the change is sent to the crawler bot | `patient.v2.service.js:560-720`, `manual_upload.v2.service.js:503,586` | inferred |
| late_date | Date 3 days after next_send; used for late and overdue patient lists | `patient.v2.service.js:676`, `:990-1010` | inferred |
| evoke_id (API usage) | Sequence-generated patient identifier, also used as serial number when none is supplied; used to merge duplicate patients | `repository/v2/patient.v2.repository.js:960-985`, `patient.v2.service.js:3561` | inferred |
| IDTF / INVOICE / SPLIT (API usage) | Account billing type: IDTF bills with modifier codes (93297, 93298 with 26) and no 93296; INVOICE bills without modifier and requires 93296 with 93294 or 93295; SPLIT decides per patient (new patients IDTF) | `util/v2/billingCode.v2.util.js:36-60` | inferred |
| RPM and RPM codes | Remote patient monitoring with BodyTrace blood-pressure cuff, scale and Holter devices; billing codes 99453 (initiation), 99454 (16 or more reading days), 99457 (first 20 minutes of communication), 99458 (each additional 20 minutes) | `util/constants.js:201-250`, `services/v2/rpm.v2.service.js:112-215` | inferred |
| HF (API usage) | Heart-failure reports and billing code 93297 (and 93297 with 26); report names get an (HF) suffix | `util/constants.js:204`, `manual_upload.v2.service.js:640-660` | inferred |
| ILR (API usage) | Implantable loop recorder billing codes 93298 and 93298 with 26 | `util/constants.js:205` | inferred |
| Report tabs | Where a report sits in review: Evoke active, processed or archived; clinic active, for review, processed or billed; signed is a separate flag (eSig) | `manual_upload.v2.service.js:640-660`, `util/common.util.js` updateReportState | inferred |
| hl7job (ORU, DFT, IDCO) | A queued export of a report to a client EHR: ORU is the PDF result, DFT the billing charge, IDCO discrete device data; statuses pending, completed, error, timeout | `common/constant.js:442-452`, `util/constants.js:836` | inferred |
| ADT | Admit/discharge/transfer records received from the client EHR and matched by MRN and service date to supply encounter data for an export; the producer is outside this repository | `services/v2/adt.v2.service.js:33-55` | inferred |
| OAC / LAAO | Anticoagulation (oral anticoagulant) status and left atrial appendage occlusion device status used in alert protocols and patient records | `validators/v2/alert_protocol.v2.validator.js:20-60`, `patient.v2.service.js:480-520` | inferred |
| Non-enrolled patient | A patient known from a device or manufacturer list who has not yet been enrolled; enrolling creates the patient, schedule and onboarding task | `patient.v2.service.js:4008-4130` | inferred |

## Terms from evoke-portal-front-end

Provenance: evoke-portal-front-end @ 79953d33432479d03bcde9545050dbb9a7193ed8, 2026-10-02, aisdlc@1.0.0. The developer chose code-derived definitions flagged inferred (2026-10-02); terms with no code support stay unknown. The "Used in code" column is evidence.

| Term | Definition (inferred) | Used in code | Status |
|---|---|---|---|
| RPM | Remote Patient Monitoring: monitoring of patients through home measurement devices; the portal embeds the Clinii portal for it | Sidebar title "Remote Patient Monitoring", route `/rpm`, role `rpmUser` | inferred |
| Clinii | The third-party RPM system shown inside the portal | `getRpmCliniiView`, `clinii_user_id` | inferred |
| CardioOneConnect | Wearables view for physicians, reached through Cognito single sign-on (provider name "Rhythm") | Sidebar title, route `/wearables`, `/cognito/auth-url/rhythm` | inferred |
| EHR Jobs (HL7 / API) | Lists of queued exports of reports to client EHR systems, with retry and bulk actions | Routes `/ehr-jobs/hl7jobs`, `/ehr-jobs/apijobs` | inferred |
| No Show Patients | Patients who did not send a transmission when expected, followed up by staff; includes non-enrolled patients and live-call tasks | Route `/no-show-patients*`, `nonCompliantPatients` | inferred |
| Live Call Task | A task for staff to phone a patient; statuses to do, needs follow-up, completed | `LIVE_CALL_STATUS`, `/no-show-patients/live-call-tasks` | inferred |
| Reports Assignment | Assignment of reports to reviewers by interval, visible for one customer clinic only | Route `/reports-assignment`, clinic-name check | inferred |
| Clinic Review | The worklist where clinic users and physicians review reports before they are processed | Route `/transmissions/clinic-review` | inferred |
| Clinic roles | Clinic, Physician, Clinic Admin (and Clinic Reviewer, treated separately in some checks): users of partner clinics | `CLINIC_ROLES` in `src/static/constants.js` | observed |
| Evoke roles | Admin, User, Assistant: Evoke staff | `EVOKE_ROLES` | observed |
