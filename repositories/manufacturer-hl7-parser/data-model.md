---
repository: manufacturer-hl7-parser
analyzed_commit: e185ff36fe03c649cd7e9750e895c8c43f857c43
analyzed_at: 2026-10-01T17:37:23Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [src/database/connection.py, src/database/query.py, src/database/models/**, src/notes/query.py, src/analytics/query.py, src/events/user_activity_log.py, src/processor.py:139-219]
---

# Data model (Phase F)

## Connection

- `connect(DATABASE_NAME, host=DB_URI)` in `src/database/connection.py:23`; both values come from the Secrets Manager secret (or local `.env`). Names only; values never recorded.
- Single `Mongo` singleton wraps mongoengine `__raw__` queries; writes use pymongo `update_one` / `insert_one` with `session=Mongo.session`.
- `processor.database_updates` (`processor.py:139-219`) runs a multi-document transaction, retried up to 5 times with backoff on `DuplicateKeyError`/`OperationFailure`. A failure whose `keyPattern` contains `oruControlId` is treated as a duplicate ORU. Transactions imply a replica set or sharded cluster (`unknown` from the repo).
- Outside the transaction: `Mongo.upsert` via `.save()` (used for `cardio_one_api_logs`, `delayed_messages`) does not pass the session; reads and the `sequencers` `$inc` also run outside it (analyst finding, inferred).
- The database is configured only by `DB_URI` / `DATABASE_NAME` and holds ~28 models, many unrelated to this pipeline: it is shared. Ownership is recorded in `system/repository-relationships.yaml` (developer answers) and otherwise `unknown`.

## Indexes

- Declared: `patients.serial_number` (unique, required), `patients.evoke_id` (unique). No `meta.indexes` anywhere.
- A unique index on `reports.oruControlId` is implied by `processor.py:198` but not declared in the model; whether it exists is `unknown`.
- Query patterns that depend on indexes (existence `unknown`): `patients` by serial_number, `deviceInformation.modelName`/`modelNumber`, `previous_devices.*`, name/dob (regex); `reports` by `patient_serial_num`, `oruControlId`, `hl7_file_path`.

## Collections written by this repository

| Collection | Write | Notes | Evidence |
|---|---|---|---|
| `patients` | insert (new) / `$set`, `$push` (existing) | account, names, dob, device, `serial_number` (unique), `evoke_id` (`EMC` + 8 digits from `sequencers`), manufacturer, send/bill dates, `implanted_billing_schedule` (day_31/day_91/day_custom), `deviceInformation`, `previous_devices`, `information`, insurance, guarantor, `initial_report_tab`, `hospital_id`. Contains PHI (names, DOB, MRN, insurance, guarantor). | `src/database/query.py:398-516` |
| `reports` | insert (a second insert for an HF report, `oruControlId` suffixed `-HF`) | `created_by` default "AWS LAMBDA"; `patient_serial_num`, `device_serial_number`, billing/diagnosis codes, `hl7_file_path`, `file_path`, `hf_file_path`, `hf_pages`, alert/warning flags, tab flags, `summary_report_flag`, `transmission_alert_information`, `gen_changed` | `query.py:533-650` |
| `report_notes` | upsert by `reportId` | `evoke_notes`, `updated_by`, unix-int timestamps | `src/notes/query.py:236-252` |
| `alert_metadata` | upsert by `patientId` | battery, sensing, pacing-percentage, arrhythmia flags | `src/notes/query.py:255-286` |
| `patient_analytics` | raw upsert by `patient_id` (`$set` + `$push` metadata) | per-report metrics read back by later runs | `src/analytics/query.py` |
| `sequencers` | `find_one_and_update` `$inc`, upsert | counter `name='patients'` for `evoke_id` | `connection.py:81`, `query.py:470` |
| `devices` | insert when model unknown but device type known | | `query.py:661-715` |
| `leads` | insert when lead model unknown | | `query.py:188-198` |
| `tasks` | insert ("new patient" task, created by "Evoke Task Automator") | | `query.py:844-877` |
| `live_call_tasks` | delete by `patient_id` (only delete in the repo; empty-filter guard in `remove_document`) | | `query.py:880-883` |
| `cardio_one_api_logs` | insert/update | CardioOne job status | `query.py:886-929` |
| `delayed_messages` | insert on arrival, update on re-arrival | bucket, `hl7_file_path`, arrival time, event/summary report ids, `processing_delayed_by` | `query.py:932-1016` |
| `user_activity_logs` | raw upsert with `$push` | module "Transmission Report", action "Transmission Arrived" | `src/events/user_activity_log.py` |

## Collections read only

`accounts` (facility/account lookup; settings per manufacturer: initial report tab, note settings, note content format, `saas_account`, `export_for_billing`, `billing_type`, `subscribe_setting`, `status_letter`, `medical_center_id`), `manufacturers`, `device_types` (`shortName`, `billingCode`, `hfBillingCode`, `diagnosisCode`), `users` (service user lookup), `device_group`, `report_templates`, `report_note_sections`, `report_note_alert_protocols`. `patient_notes` and `reportbanners` are read only by the unreachable `src/artanis/query.py`.

## Relationships

`devices` -> `device_types`, `manufacturers`; `leads` -> `manufacturers`; `patients` -> `hospitals`, `patients` (`duplicate_from`); `alert_metadata`, `patient_analytics`, `live_call_tasks`, `cardio_one_api_logs` -> `patients`; `reports` <-> `report_notes` by string `reportId`; `reports` -> `patients` only by `patient_serial_num` string.

## Model smells (observed in model files by the analyst; not independently re-verified)

- `Patients.created_at/updated_at` default `datetime.now()` evaluated once at import.
- `Reports.warning_flag` declared twice; `Reports.oruControlId` required with default string `"False"`; `Reports.alert_text` is a `ListField` with `max_length`.
- Schema ownership and migrations: none in this repo; owner `unknown`.

## Unknowns

Who else writes these collections; real indexes; replica-set topology. Checked: model files, query modules, connection code.
