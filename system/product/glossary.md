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

## Terms from patient-billing-schedule

Provenance: patient-billing-schedule @ ec1d8894c633996d7fc9e7a9423d21521a981bf6, 2026-10-05, aisdlc@1.0.0. Definitions are written from how the code uses each term and are **inferred**, not confirmed by the developer; each is listed under Open questions in [Billing Window Scheduling](capabilities/billing-window-scheduling.md). Other terms already defined above (next_send, late_date, HF, IDTF) are not redefined.

| Term | Definition (inferred) | Used in code | Status |
|---|---|---|---|
| Ideal billing date | The expected billing date for a code: signature-anchored date, stored cutoff date, implant date plus a wait period (first time), or last billing date plus cycle (recurring) | `main.py:171-216` | inferred |
| Billing window | Days before and after the ideal billing date within which a report may be chosen as billable | `main.py:31-105`, `src/utils/constants.py:28-45` | inferred |
| Backbill | Billing a report after its window ended, using a widened range | `main.py:86-92`, `src/database/schedule.py:54-98` | inferred |
| Next send | Date the next transmission from the patient is expected (see also the rest-api-evoke entry) | `src/database/schedule.py:153-167` | inferred |
| Late date | Three days after next send; passing it without a report makes the patient late | `src/utils/constants.py:46`, `src/database/schedule.py:153-167` | inferred |
| Signature anchor | Account billing setting that bases the next billing date on the latest signed report instead of the last billing date | `src/utils/constants.py:192-194`, `main.py:174-202` | inferred |
| Bot event | Message with the patient id sent to the manufacturer crawler so it fetches data for a late patient | `src/database/schedule.py:318-363` | inferred |

## Terms from client-emr-hl7-parser

Provenance: client-emr-hl7-parser @ b9615126ee17c4e2583e08ac81faaa9d12c63005, 2026-10-09T00:00:00Z, aisdlc@1.0.0. The developer gave no definitions; the entries below use the standard HL7 v2 meanings and are **inferred**, with product definitions unconfirmed (see Open questions in [EMR message handling rules](business-rules/emr-message-handling-rules.md)). The hl7job entry above (from rest-api-evoke) also covers ORU, DFT and IDCO as job types; this section defines them as messages.

| Term | Definition (inferred, standard HL7 meaning) | Used in code | Status |
|---|---|---|---|
| ADT | Admit, discharge and transfer message from a client EMR carrying patient and visit information; stored as an ADT record per account | Event `ADT_PARSING`; types A02, A03, A04, A08, A31 | inferred |
| ORM | Order message from a client EMR; handled with the ADT messages | Type `ORM_O01` | inferred |
| ORU | Observation result message; inbound from a client EMR, or outbound carrying an Evoke report | Type `ORU_R01`; event `ORU_CREATION`; inbound ORU arrives through `ADT_PARSING` | inferred |
| DFT | Detailed financial transaction message carrying a billing charge, sent to the client EMR | Event `DFT_CREATION`, type `DFT_P03` | inferred |
| IDCO ORU | Outbound result message carrying discrete device data from the manufacturer's original file; product meaning of "IDCO" not confirmed | Event `IDCO_ORU_CREATION`, job type `IDCO_ORU_R01` | inferred |
| ACK | Acknowledgement message accepting (AA), rejecting (AR) or reporting an error (AE) for a received HL7 message | Event `ACK_PARSING`; `acks` collection | inferred |
| Client account alias | A lower-case sending-application or facility name mapped to the client account whose handler is used | `APPLICATION_FACILITY_MAPPER` | observed |

## Terms from manufacturer-crawler

Provenance: manufacturer-crawler @ d6aa388a03c12e777846a704818ba5903a021a4f, 2026-10-15T08:55:00Z, aisdlc@1.0.0. The three definitions below are written from the code and are **inferred**, pending the developer's wording. "Next send" is defined in the sections above.

| Term | Definition (inferred) | Used in code | Status |
|---|---|---|---|
| Halted account | A manufacturer portal account that the crawler bot has set inactive (schedule off) after the portal rejected its credentials; it stays halted until reactivated elsewhere | `utils/accounts.py` `setAccountsAsHalted`; `manufacturer_accounts.haltInfo` (halted by "Bot", reason, time) | inferred |
| Disconnected monitor | A patient's home monitor that a manufacturer portal lists as not communicating; a technical retrieval exists but is outside product documentation | `eventHandler/disconnected_monitors.py` | inferred |
| No-show | A patient who did not send a transmission when expected; the crawler's disconnected-monitor results are logged under a "no-show" name | `noshow_disconnected_logs`, S3 no-show prefix | inferred |

### Open questions (manufacturer-crawler terms)

- Wording of the three terms above is unconfirmed.
- The existing "Bot event" entry under patient-billing-schedule says a bot event makes the crawler "fetch data for a late patient". The crawler code shows a bot event makes it set the portal's next-send date (and, for Biotronik, export a report); it does not fetch data into Evoke. That entry was not edited (it belongs to another repository's section) and needs a decision.
