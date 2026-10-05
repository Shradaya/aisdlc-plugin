---
repository: patient-billing-schedule
analyzed_commit: ec1d8894c633996d7fc9e7a9423d21521a981bf6
analyzed_branch: main
analyzed_at: 2026-10-05T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/database/connection.py, src/database/query.py, src/database/schedule.py, src/database/user.py, src/events/billing_activity_logger.py, src/events/user_activity_log.py, src/events/eventEmitter.py, src/utils/constants.py, src/utils/utils.py, main.py]
---

# Data model (Phase F)

Names only; no values. The repo defines no schemas or models: it uses raw pymongo against a MongoDB database shared with other Evoke services (database name from secret key `DATABASE_NAME`, URI from `DB_URI`; `src/config.py`). Field lists below are the fields this code reads or writes, not the full documents. Schemas, indexes and validation live in `rest-api-evoke` (`models/v2/*.js`); not re-verified here. Real indexes and topology: `unknown` (checked: no index creation anywhere in this repo).

## Collections accessed

| Collection | Access | Fields used | Evidence |
|---|---|---|---|
| `patients` | read, update (never insert, `upsert=False`) | Read: `_id`, `active`, `account`, `manufacturer`, `serial_number`, `doi`, `dob`, `name`, `device`, `created_at`, `information` (`phone1`, `phone2`, `physicians[].name`), `deviceInformation.modelName`, `deviceInformation.modelNumber`, `billingHistory[]` (`billing_code`, `billing_date`), `last_bill_date`, `next_send`, `next_send_cycle`, `late_date`, `implanted_billing_schedule`. Written: `next_send`, `late_date`, `next_bill_date`, `explicit_next_bill_date`, `active`, `deactivate_info{reason, updated_at}`, `updated_at`, and `implanted_billing_schedule.*` (below). | `src/database/query.py` `get_patient`, `get_all_patients`; `src/database/schedule.py` |
| `reports` | read, update (never insert) | Read filters: `evk_active`, `evk_archived`, `moved_for_backbill`, `billing_code`, `patient_serial_num`, `device`, `report_date`, `summary_report_flag`, `signed_at`, `last_billing_date`. Written: `billable`, `report_billing_date`, `moved_for_backbill`, `evk_active`, `evk_processed`, `evk_archived`, `clinic_for_review`, `updated_at`, `updated_by`. | `src/database/query.py` `get_report`, `set_billable_true`, `set_billable_false`, `get_latest_signed_report_date` |
| `devices` | read (aggregation) | `modelName`, `summary_report`, `deviceTypeId` (lookup to `device_types.shortName`) | `get_device_info` |
| `device_types` | read via `$lookup` | `_id`, `shortName` | `get_device_info` |
| `accounts` | read (aggregation) | `name`; `settings.manufacturer.<manufacturer_name_lowercase_underscored>.initial_report_tab.hf` and `.regular`; `settings.billing.next_process_anchor` (value `signature` or default billing) | `get_initial_report_tab_for_account_manufacturer`, `get_account_billing_anchor` |
| `tasks` | insert, update | Insert: `description`, `date`, `status` ("To Do"), `patient{_id, name, serial_number}`, `archived`, `created_by` ("Automated Schedule Monitor Lambda"), `created_at`, `account`, `automated_scheduling`. Update: `archived`, `updated_at`. | `create_task`, `archive_task` |
| `users` | read | document where `name` = "EVOKE AUTOMATED NOTES"; `_id` used as acting user | `src/database/user.py` |
| `manufacturer_crawler_report_status` | update with `upsert=False` | `document_id` or `patient_id`, `action`, `name`, `manufacturer`, `account`, `next_send{preceding_next_send, current_next_send}`, `status`, `error{hasError, reason}`, `event_type`, `created_at` | `log_bot_invocation`, `send_bot_event_to_sqs` |
| `billing_activity_logger` | upsert (create) | `document_id`, `collection`, `updated_at`, `$push logs` | `src/events/billing_activity_logger.py` |
| `user_activity_logs` | upsert (create) | `user_id`, `document_id`, `module` ("Transmission Report"), `$push logs{url, document_id, action "Billing Date Suggested", collection_name, payload, updated_payload, error, created_at}` | `src/events/user_activity_log.py` |

Declared in constants but unused here: `hl7jobs`, `adts`, `acks`, `report_cover_pages` (`src/utils/constants.py`).

Note on `manufacturer_crawler_report_status`: `Mongo.upsert` in the failure path is called with `upsert=False` and a filter on `patient_id`, so it only updates an existing document and creates none (observed). The collection's creator is `unknown` (not this repo).

## `patients.implanted_billing_schedule` (as written by this code)

Keys `day_31`, `day_91`, `day_custom` (`BILLING_SCHEDULES`); the default constant `BILLING_CYCLE_CODES` uses space-padded keys (`'day_31 '`, `'day_91  '`) to hold several codes per cycle. Per schedule: `active`, `billing_code`, `cutoff_date`, `days` (custom cycle length), `status` (`red` late / `green` on schedule), `suspend_date`, `last_billing_date`, `last_report_date`, `estimated_cutoff_date`, `estimated_last_billing_date`, `estimated_last_report_date`, `updated_at`, `updated_by` ("AWS LAMBDA BILLING"), `billing_tasks`. Top level: `late` (bool), `billing_tasks.{first_call|second_call|third_call|letter}.{trigger_date, triggered, task_id}` (duplicated under each schedule "for backward compatibility", `src/database/schedule.py`). Who else reads these keys is `unknown` here (the portal and `rest-api-evoke` are expected to; not verified).

Billing code tables (`src/utils/constants.py`): codes 93297, 93298 (+ " 26"), 93294, 93295, 0578T, 93264; `OLD_CODE_TO_NEW` maps 93297/93298 to the " 26" form; `SEARCHABLE_BILLING_CODES` lets a lookup match both forms.

## Constants that act as data contracts

- Window sizes and cycle days: `FIRST_BILLING_DAYS`, `RECURRING_BILLING_DAYS`, `PRE_/POST_IDEAL_BILLING_WINDOW_*`, `DAY_31_OFFSET` 4, `DAY_91_OFFSET` 7, `LATE_PATIENT_OFFSET` 3, `LATE_PATIENT_NEXT_SEND_CYCLE` 7, `NEXT_SEND_OFFSET` 1.
- Late tasks trigger at late date + 2, 9, 16 (calls) and 20 (letter) days; suspend date = late date + 30 (`prepare_late_tasks_query`).
- Patients with no report in 730 days (`DAYS_OFFSET_TO_SET_PATIENT_INACTIVE`) are set `active: false` with reason "No Longer Monitoring" (`PATIENT_DEACTIVATE_REASON`).
- Excluded: account `UCH` and serial numbers containing lowercase letters (`get_all_patients`); `Boston Scientific` device type `ILR` is blocked from bot events when no report was found (`MANUFACTURERS_BLOCKED_FOR_NEXT_SEND_UPDATE`).

## Transactions and consistency

- `update_billables` writes within a pymongo session and transaction (`Mongo.session`, `session.start_transaction()`); abort on exception. This requires a replica set or sharded cluster (topology `unknown`, implied by the code).
- Writes use `retry_on_write_conflict` (3 tries, sleeps 3 s times the attempt). Caveat (observed): after three failed retries the wrapper returns `None` silently and the loop exits without raising (`src/database/query.py`), so a persistent write conflict is dropped without an error.
- `get_all_patients` and the others return cursors; reads inside the transaction use the session only via the write helpers (`find`/`find_one` do not pass `session`), so reads are outside the transaction snapshot (observed in `src/database/connection.py`).
- `Mongo.upsert` always sends `$push` with the (possibly empty) `push_data`; an empty `$push` document is rejected by some MongoDB versions (`unknown` whether the deployed server accepts it; checked `connection.py` only).

## Unknowns

- Index definitions, DB name, cluster topology, schema validation rules.
- Whether this Lambda is the only writer of `implanted_billing_schedule.*` and `next_send`; the sibling `manufacturer-hl7-parser` and `rest-api-evoke` knowledge should be compared during cross-repository analysis.
