---
repository: client-emr-hl7-parser
analyzed_commit: 542997c1b6c48c4e410090b6d49e92e02cd5c8ba
analyzed_at: 2026-10-15T08:46:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/utils/constants.py, src/database/connection.py, src/database/query.py, src/database/query_utils.py, src/database/user.py, src/utils/aws.py, src/config.py, src/eventHandler/oru.py, src/eventHandler/adt.py]
---

# client-emr-hl7-parser: Data model

Datastore: MongoDB, accessed with raw `pymongo` through the singleton `Mongo` (`src/database/connection.py`). DB name and URI come from the Secrets Manager secret (names `DB_URI`, `DATABASE_NAME`). No schemas, models, migrations or indexes are defined here; `mongoengine` is pinned in `requirements.txt` but unused. The schema is owned by another service (the portal/API; which repo is `unknown`). Fields below are only those this repo reads or writes.

## Collections (names from `src/utils/constants.py`)

| Collection | Access | Used for (evidence `src/database/query.py` unless noted) |
|---|---|---|
| `reports` | read | `get_report`: billable, file_path, hf_file_path, billing_code, diagnosis_code, ehr_notes, transmission_type, device_category, signed_at, hl7_file_path, manufacturer, report_date, device, device_serial_number, billing_diagnosis_codes, last_billing_date (as `report_billing_date`); `get_clinician_notes` reads `clinic_notes`. |
| `report_cover_pages` | read | `get_report_cover_page`: `cover_page_URL` by `reportId` (ObjectId). |
| `hl7jobs` | read | `get_hl7jobs`: job doc by `report_id` and `type` (`ORU_R01`, `IDCO_ORU_R01`, `DFT_P03`, or type missing); carries `visit_location`. |
| `report_notes` | read | `get_report_notes`: unwinds `evoke_notes`. |
| `accounts` | read | `get_clinic_name`, `get_account_by_name`: `name`, `facility`, `alias`, `timezone`, `settings.billing_type` (IDTF). |
| `patients` | read, write (upsert, create) | match by MRN, account, DOB, names (`generate_patient_filter_query`); `$set` of name, firstName, lastName, middleInitial, dob, gender, `information.*` (phone1/2, email, street1/2, city, state, zip, visit_location, anticoag status, physicians, idtf), `insurance`, `secondary_insurance`, `tertiary_insurance`, `guarantor`, `deviceInformation.{modelName,modelNumber,model_display_name}`, `previous_devices`, `secondary_device_information`, `doi`, `evoke_id`, `serial_number`, `account`, `manufacturer`, `active`, `subscribe_setting`, `next_send_cycle`, `next_send`, `next_bill_date`, `explicit_next_bill_date`, `implanted_billing_schedule` (`day_31`/`day_91`: active, status, billing_code, cutoff_date, last_report_date, last_billing_date, updated_by), `created_at/by`, `updated_at`, `updated_by = "ADT LAMBDA"` (`query_utils.py`). |
| `patient_diagnoses` | read, upsert | `{patientId}` doc, `$push` into `diagnosisHistory` (code, description, diagnosedAt), de-duplicated in app code. |
| `adts` | read, insert, update | ADT/ORU receipt log keyed by mrn + account + transmission_type + (csn or order_number for ORM_O01). Fields: mrn, csn, controlID, account, pre_id, dob_s, firstName, lastName, gender, middleInitial, dob, admission_type, filePath, previous_file_paths (`$push`), adtDate, patient_class, location, serviceDate, insurance_plan, transaction_type, visit_location, transmission_type (`remote` or `inOffice`), message_type, billing_code, order_number, status, updated_at. Duplicate check by account + `controlID` (`check_duplicate_adts`). |
| `adts_book_keeping` | insert, update | Same shape as `adts`, used instead when `patient_update_only` is true (COVENANT alias path, `src/eventHandler/adt.py`). |
| `acks` | insert | `{path}` S3 key of received ACK (`insert_ack`). |
| `sequencers` | read-modify-write | `{name: "patients"}` counter `$inc sequence` with upsert; produces `evoke_id` via `create_evoke_id` (`get_next_sequence_value`). Not atomic-safe against absent doc beyond upsert semantics; note only. |
| `devices` | read | `modelName`, `manufacturerId`, `deviceTypeId`, `display_name`; `$lookup` to `manufacturers` and `device_types` (`diagnosisCode`, `billingCode`, `hfBillingCode`, `shortName`). |
| `manufacturers` | read (via `$lookup`) | `name`. Constant `MANUFACTURERS_COLLECTION` is defined; direct query not seen. |
| `device_types` | read (via `$lookup`) | literal collection name in aggregation, not in constants. |
| `users` | read | `get_user_id`: user named "EVOKE AUTOMATED NOTES" -> `_id` used as `created_by` / `updated_by` (`src/database/user.py`). |
| `tasks` | insert | `create_task`: description "NEW PATIENT / COMPLETE ONBOARDING PROTOCOL / - AUTOMATED TASK", status "To Do", patient {_id, name, serial_number}, archived false, created_by "Evoke Task Automator", account, active (`create_task_payload`). Created for new patients from ORU parsing. |

Writes by operation: patients (insert/upsert/update), patient_diagnoses (upsert), adts and adts_book_keeping (insert/update), acks (insert), sequencers (inc), tasks (insert). No deletes found in `src/database/`.

## S3 (object storage)

Bucket: `PROCESSED_BUCKET` (env var name). Key prefixes in `src/config.py`: `orus/` (generated ORU), `adts/` (received ADT), `acks/` (received ACK), `dfts/` (generated DFT), `ehr_orus/` (received ORU), `pdfs_with_cover_page/` (merged PDF). Inputs (report PDFs `file_path`, `hf_file_path`, cover page URL) are read from the same bucket via `download_file_from_s3`. IDCO flow reads HL7 from per-manufacturer buckets given by JSON env `MANUFACTURER_BUCKET_MAPPING` and restores Glacier/Deep Archive objects (`src/utils/aws.py` `get_file_content_with_restore`). Local scratch dir: `BASE_PATH`, emptied at end of every invocation.

## Messages and constants

- HL7 field mapping lives in `hl7/extractor/*` and `hl7/creator/*`; per-account OBR/OBX/PV1 specifics in `src/accountHandler/<account>/constants.py` (not enumerated here).
- Billing codes: DAY_31 `93297, 93297 26, 93298, 93298 26, 93264`; DAY_91 `93294, 93295, 0578T` (`src/utils/constants.py`). HF billing codes `93297`, `93297 26` (`src/eventHandler/contants.py`).
- Gender map `m/f/u/a/n` -> male/female/unknown/ambiguous; timezone map for CST/EST/MST/PST etc. (`src/utils/constants.py`).

## Unknowns

- Authoritative schema, indexes and owning repository for these collections (checked this repo only).
- Whether `patients` writes conflict with other writers (`updated_by` values suggest several Lambdas; not verified).
