---
repository: rest-api-evoke
analyzed_commit: 84768b56f78a3663d6cfb9acf128556c4cdab89f
analyzed_at: 2026-10-15T08:40:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [models/v2/account_document.v2.model.js, models/v2/activity_log.v2.model.js, models/v2/clinic_signature_updates.v2.model.js, models/v2/report_cover_page.v2.model.js, repository/v2/account_document.v2.repository.js, repository/v2/token.v2.repository.js, repository/v2/live_call_task.v2.repository.js, services/v2/live_call_task.v2.service.js, util/v2/userStatus.v2.util.js, models/v2/*.js, models/*.js, database/index.js, util/database.js, repository/v2/sequencer.v2.repository.js, repository/v2/patient.v2.repository.js, util/common.util.js, util/v2/password.util.js, util/v2/token.v2.util.js, services/v2/patient.v2.service.js]
---

# Data model (Phase F)

Names only; no values recorded. Observed in the cited files unless marked inferred. Mongoose schemas were read in full; the field lists below are summaries.

## Connections and access styles

- Two connections open at start-up (`app.js:50`): native `MongoClient` (`util/database.js` `mongoConnect`/`getDb`) and Mongoose (`database/index.js` `connectDb`). Both take `DB_URI` from the Secrets Manager secret (`util/database.js:9`, `database/index.js:11`). `strictQuery` is false (`database/index.js:9`).
- v2 code uses Mongoose models (`models/v2/*.v2.model.js`) via `repository/v2/`. EL-5638 "Phase 3: native MongoDB driver to mongoose migration" (`115ae4182`) moved `activity_logs`, `clinic_signature_updates` and `report_cover_pages` to Mongoose: the old classes (`models/activity_log.js`, `models/v2/clinic_signature_updates.js`, `models/v2/report_cover_page.js`) are now thin wrappers over new `*.v2.model.js` schemas. `token.v2.repository.js` uses the Mongoose `Token` model.
- Native driver (`getDb()`) is still used (grep at this commit, excluding tests): `models/patient.js`, `models/report.js`, `models/user.js`, `models/v2/patient.js`, `models/v2/report.js`, `controllers/patient.js:682`, `repository/v2/patient.v2.repository.js:1935,1944` (patient merge), two seed scripts under `database/seed/`, and `app.js` (`mongoConnect`). So `patients`, `reports` and `users` still have raw-driver write paths alongside the Mongoose schemas, and Mongoose schema rules do not apply to those paths (inferred from `models/patient.js:76-133`). `schemas/*.js` are Joi/helper files.
- Topology, replica set, database name: `unknown` (name comes from the URI).
- Shared DB: the Python Lambda `manufacturer-hl7-parser` writes `patients`, `reports`, `report_notes`, `alert_metadata`, `patient_analytics`, `sequencers`, `devices`, `leads`, `tasks`, `live_call_tasks`, `cardio_one_api_logs`, `delayed_messages`, `user_activity_logs` (per that repo's `data-model.md`; not verified here).

## Models (collection)

Core clinical
- `patients` (`models/v2/patient.v2.model.js`, `versionKey:false`): `evoke_id` (unique), `serial_number`, `account`, `hospital`, `sub_account`, names, `dob` (String), `gender`, `mrn`, `ssn`, `information.*` (phones, email, address, emergency contact, diagnosis, physicians, visit_location, anticoag), `deviceInformation.*` (model, ra/rv/lv), `insurance` / `secondary_insurance` / `tertiary_insurance` (with `insured.*`; each now also has `authorization_code` String, `treatment_start` Date, `treatment_end` Date from EL-5602, `patient.v2.model.js:377-385,444-452,511-519`; the Joi validator caps `authorization_code` at 30 characters, `validators/v2/patientValidator.js:169`, the schema itself has no maxlength), `guarantor.*`, `subscribe_setting.*` (`communication_status` enum on/off/paused; `notification_channels`), billing dates and history arrays, `implanted_billing_schedule` (untyped), `rpm_devices` (Object), `previous_devices`, `initial_report_tab`, `duplicate_from`, `deactivate_info`, `clinii.patient_id`, `rhythm.patient_id`, `benchmark_id`, `active`.
- `reports` (`models/v2/Report.v2.model.js`): `patient_serial_num` (string link), `account`, `manufacturer`, flags (`evk_active`, `evk_processed`, `evk_archived`, `clinic_active`, `clinic_processed`, `clinic_for_review`, `locked`, `billable`, `explicit_non_billable`), billing and diagnosis codes, paths (`file_path`, `hf_file_path`, `hl7_file_path`, `pickle_path`), `transmission_type` enum (`remote`, `inOffice`, connectivity constant), `signed_by`/`signed_at`, `assignedUser`, `audit_info`, `chf_screening`, `provider_note`, `archived_by`/`archived_at`, `oru_status`/`dft_status`/`idco_status`/`sftp_status`, `ehr_notes`, `report_modification_history`.
- Report-related: `report_notes` (`reportId` String), `report_assignments`, `reportBanner`, `report_cover_pages` (`report_cover_page.v2.model.js`: `reportId` ObjectId, `cover_page_URL`, `created_at`, `updated_at`; Mongoose since EL-5638), `rpm_report_cover_page`, `report_templates`, `report_note_sections`, `report_note_alert_protocols` (`alert_protocol.v2.model.js`), `report_note_extractions`, `report_note_suggestions`, `uploads`, `clinic_signature_updates` (`clinic_signature_updates.v2.model.js`: `reportId`, `updated_by`, `created_at`, `updated_at`; Mongoose since EL-5638).
- Patient satellites: `patient_notes`, `patient_notes_history`, `patient_note_deletion_requests` (status enum pending/approved/declined), `patient_medication`, `patient_diagnoses`, `patient_document`, `patient_analytics`, `patient_data_points` (unique `patient_id`), `patient_communication_log`, `patient_live_calls` (unique `zoom_call_id`), `live_call_tasks` (status enum todo/need_follow_up/completed/archived), `bp_readings_histories`, `bt_measurements`, `non_enrolled_patients`, `patient_data_form_settings`, `patient_reminders` (nested logs/attempts; enums for communication type, provider twilio/postgrid/ses, status Sent/Failed/Pending).
- Devices: `devices` (refs `device_types`, `manufacturers`; `deviceStatus` enum active/inactive), `device_types`, `device_group` (explicit collection name), `leads`, `manufacturers`, `manufacturer_accounts`.

Accounts and security
- `account_documents` (new, EL-5597; `models/v2/account_document.v2.model.js`, explicit collection name, timestamps `created_at`/`updated_at`, `versionKey:false`): `name` (account name), `account_id` (ObjectId ref `accounts`, required, unique index), `alert_protocol` and `clinic_protocol` (strings holding S3 object keys such as `account-documents/<account-name-slug>/alert-protocol.pdf`; the PDF bytes live in S3, not Mongo). Written by `upsertDocumentKey` (`findOneAndUpdate` upsert) in `repository/v2/account_document.v2.repository.js`.
- `accounts` (timestamps): `name`, `facility[]`, `settings`, `role_preferences`, `schedules`, `labs`, `saas_account`, `rpm_only`, `medical_center_id`, `alias`, `slug`, `timezone`, `evoke_department`.
- `users` (`models/v2/users.v2.model.js`): `email` (unique), `role`, `accounts[]`, `manufacturer[]`, `attempts`, `locked`, `active`, `password_expiry`, `reset_token`, `idp_user`, `user_prefs` (`mfaEnabled`, `allowed_billing_codes`, ...), `secondary_roles[{account, roles[]}]`, `signature`, `in_office_signature`, `session_expiry_duration`, `is_auditor`, `quick_text_templates[]`, `clinii_user_id`, `rhythm.*`. The legacy class `models/user.js` also sets `isFollowingPhysician`, `followingPhysicians`, `isFollowingHospital`, `followingHospitals`, `test_user`, `created_by`, which the v2 schema does not declare (Mongoose strict would drop them on v2 writes; whether v2 writes them is `unknown`). `util/v2/hospitalAccess.v2.util.js` reads `isFollowingHospital`/`followingHospitals`.
- `tokens`, `temporary_tokens` (TTL), `login_otp`, `user_devices`, `user_activity_logs`, `activity_logs` (`activity_log.v2.model.js`: `document_id` ObjectId, `collection_name`, `logs[]` Mixed, `strict:false`; Mongoose since EL-5638), `benchmark_tokens`, `csp_violations`, `hospitals`, `epic_users`, `notifications`.

Billing, communications, integrations
- `billing_amount`, `billing_rules` (type enum IDTF/SPLIT/INVOICE), `invoices`, `invoice_counters`, `insurances`, `referring_providers`, `letter_templates`, `letter_content_templates`, `no_show_letters`, `post_grid_logs`, `twilio_logs`, `opt_out_phone_numbers`, `reminder_backlogs`, `nextSendUpdate_log`.
- `hl7jobs` (`report_id` String, `adt_id` ref `adts`), `adts`, `api_jobs`, `sftp_jobs`, `cardio_one_api_logs`, `tasks`, `account_analytics`.

## Indexes declared in code

None created by explicit calls (grep for `createIndex`/`ensureIndex` over `models`, `database`, `util`, `repository`, `services`, `app.js`, `schemas` found only schema-level declarations).
- unique: `account_documents.account_id` (`account_document.v2.model.js:26`), `patients.evoke_id` (`patient.v2.model.js:33`), `users.email` (`users.v2.model.js:11`), `alert_configurations.account`, `opt_out_phone_numbers.phone`, `patient_data_points.patient_id`, `patient_live_calls.zoom_call_id`, `patient_data_form_settings.title` and `key`.
- `index: true`: `billing_amount.accountId`, `patient_document` (`patientId`, `created_by`, `report_id`), `patient_medication.patientId`, `rpm_report_cover_page.patientId`, `login_otp.userId`, `patient_reminders.patient_id`, `user_activity_logs.user_id`, template `modified_by` fields; compound-style `notifications` index on `recipients.user._id`.
- TTL: `temporary_tokens.createdAt` 300 s.
- Not declared (existence `unknown`): `patients.serial_number`, `reports.patient_serial_num`, `reports.account`, `tokens.token`, `report_notes.reportId`. Heavily queried (e.g. `repository/v2/patient.v2.repository.js:136`), so probably present in the live DB. The Lambda's models declare their own unique indexes (e.g. `patients.serial_number`); index ownership conflicts are `unknown`.

## Duplicate and legacy model pairs

| Legacy | Current | Notes |
|---|---|---|
| `models/patient.js` (raw class) | `models/v2/patient.v2.model.js` and `models/v2/patient.js` (458 lines, raw class with billing-date logic) | Three representations of `patients` |
| `models/report.js` | `models/v2/Report.v2.model.js` and `models/v2/report.js` | Legacy class lacks later fields (`assignedUser`, `audit_info`, `chf_screening`, `transmission_type`, ...) |
| `models/user.js` | `models/v2/users.v2.model.js` | Auth services still import the legacy class (`services/v2/user.v2.service.js:1`, `controllers/auth.js:5`) |
| `models/bt_measurements.js` | `models/v2/bt_measurement.v2.model.js` | Legacy class delegates to Mongoose |
| `models/v2/patient_notes.js` | `models/v2/patient_notes.v2.model.js` | Wrapper |
| `models/activity_log.js`, `models/v2/report_cover_page.js`, `models/v2/clinic_signature_updates.js` | `activity_log.v2.model.js`, `report_cover_page.v2.model.js`, `clinic_signature_updates.v2.model.js` | Migrated (EL-5638): legacy file is a class wrapper calling the Mongoose model; the old "raw only" status no longer holds |

`schemas/*.js` are Joi request schemas, not DB schemas.

## Shared collections

Read or written by both this API and the Lambda: `patients`, `reports`, `report_notes`, `patient_analytics`, `sequencers` (counter `patients` drives `evoke_id`), `tasks`, `live_call_tasks`, `cardio_one_api_logs`, `user_activity_logs`, `devices`, `leads`, plus read-only reference collections (`accounts`, `manufacturers`, `device_types`, `device_group`, `report_templates`, `report_note_sections`, `report_note_alert_protocols`). `alert_metadata` is deleted here during patient merge (`services/v2/patient.v2.service.js:3665`) but has no model in this repo; it is Lambda-owned or raw. Shape changes need cross-repo checks.

## Identifiers and sequencers

- `sequencers`: `{name, sequence}`; `getNextSequenceValue` uses `findOneAndUpdate` with `$inc` and upsert (`repository/v2/sequencer.v2.repository.js:8-16`); names `patients`, `insurance_code`, `provider_code`.
- `evoke_id` = `EMC` + 8 zero-padded digits (`util/common.util.js:61`); insurance `INS` + 5 (`:78`); provider `PRV` + 5 (`:95`).
- `createPatient` assigns `evoke_id`, defaults `serial_number` to it, and retries up to `RESOURCE_CREATE_MAX_RETRIES`, swallowing every error until the last (`repository/v2/patient.v2.repository.js:960-985`).
- Report-to-patient link is `patient_serial_num` = `serial_number` (string); `report_notes.reportId` and `hl7jobs.report_id` are strings.

## Delete, archive, soft state

- `account_documents` has no delete path in the code read (upsert only).
- Hard deletes: `deletePatient` deletes the patient and all its reports (`services/v2/patient.v2.service.js:1413-1414`); many `findByIdAndDelete` repositories.
- Soft states: reports `evk_archived`, `archived_by`, `archived_at`; patients `active`, `deactivate_info`; tasks `archived`; live-call tasks status `archived` (EL-5610: deactivating a patient, on both the `updatePatientById` path and the profile-update path, calls `liveCallTaskService.archiveLiveCallTasks`, which sets every non-archived task of the patient to `archived` with `updated_by`/`updated_at` and logs a user-activity entry per task: `services/v2/patient.v2.service.js:195,2427`, `services/v2/live_call_task.v2.service.js:86-110`, `repository/v2/live_call_task.v2.repository.js:240-258`); letter templates `archived`; users `active`/`locked` (strict checks `active === false` / `locked === true`, so legacy user documents lacking the fields are not treated as blocked: `util/v2/userStatus.v2.util.js`; deactivation also deletes the user's `tokens` via `tokenRepository.deleteTokensByUserId`, `controllers/admin.js:683`).
- Patient merge re-points records of duplicates across ~12 collections and deletes duplicates (`services/v2/patient.v2.service.js:3671-3699`).

## Transactions

One helper, `runTransaction` (`database/index.js:25-46`), opens a Mongoose session. Only caller: `mergePatientTransaction`, which runs native-driver `db().collection(...).updateMany/deleteMany(..., { session })` (`repository/v2/patient.v2.repository.js:1930-1950`). `db()` is the separate `MongoClient`; `db()` is still the native `getDb` client at this commit, so whether a Mongoose session is honored by it is `unknown` and may mean the merge is not atomic (inferred; not run). Requires a replica set (topology `unknown`).

## Encrypted/hashed stored fields (names only)

- `users.password`: bcrypt (cost 12 on reset, `services/v2/user.v2.service.js:179`).
- `login_otp.otp`: bcrypt cost 10 (`services/v2/otp.v2.service.js:148`).
- `manufacturer_accounts.password`: reversible, AES-CBC then JWT-signed with the bot secret (`util/v2/password.util.js:10-33`).
- In clear: `tokens.token`, `temporary_tokens.token`, `benchmark_tokens.access_token`; `users.reset_token` declared (use `unknown`).

## PHI / PII field names (names only)

- `patients`: `name`, `firstName`, `lastName`, `middleInitial`, `dob`, `gender`, `genderIdentity`, `sexAssignedAtBirth`, `marital_status`, `ssn`, `mrn`, `information.phone1/phone2/email/street1/street2/city/state/zip`, `information.emergency_contact.*`, `information.diagnosis`, `information.notes`, `clinician_notes`, insurance fields (`patientId`, `patientGroup`, `insured.*`), `guarantor.*`, device serials, `serial_number`.
- `reports`: `name`, `patient_serial_num`, `device_serial_number`, `evoke_notes`, `clinic_notes`, `provider_note`, `ehr_notes`, `alert_text`, file paths.
- `hl7jobs` (`firstName`, `lastName`, `dob`, `mrn`, `epicID`), `adts` (`mrn`, `dob`, `dob_s`, names), `api_jobs` (`first_name`, `last_name`, `dob`, `note`), `patient_notes`, `patient_note_deletion_requests.patient.name`, `patient_medication`, `patient_diagnoses`, `patient_communication_log.description`, `twilio_logs` (`sms_content`, `voice_mail_content`), `post_grid_logs`, `opt_out_phone_numbers.phone`, `patient_live_calls.summary`, `tasks.patient.name`.
- Staff PII: `users.email`, `name`, `signature`, `in_office_signature`; `user_activity_logs.logs[].ip` and `payload`.

## Unknowns

- Real indexes, volumes, topology, replica set, owner of each shared collection (checked: models, database, repository, package scripts).
- Whether v2 user writes drop legacy-only fields.
- Whether `tokens` has an index on `token`/`user_id` (still not declared; `deleteTokensByUserId` filters on `user_id` as String).
- Seed script output shapes (`database/seed/*`, not read in depth).
