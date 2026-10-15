---
repository: patient-billing-schedule
analyzed_commit: dea0eff5ed6fd7d5a9ee734cd132862a27a4fb31
analyzed_branch: main
analyzed_at: 2026-10-15T08:45:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/database/connection.py, src/database/query.py, src/database/schedule.py, src/database/user.py, src/events/billing_activity_logger.py, src/events/user_activity_log.py, src/events/eventEmitter.py, src/utils/constants.py, src/utils/utils.py, main.py, tests/test_query_live_call_tasks.py, tests/test_schedule_deactivation_cleanup.py, tests/test_billing_activity_logger.py]
refresh_note: Refreshed from ec1d8894 to dea0eff. Touched: collections table (`live_call_tasks`, `manufacturer_accounts`, `user_activity_logs`, `manufacturer_crawler_report_status`, `users`), 730-day rule, bot event payload, upsert, consistency notes.
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
| `users` | read | document where `name` = "EVOKE AUTOMATED NOTES"; `_id` used as acting user (returned as a string, converted to `ObjectId` by the caller; empty string when no such user, in which case the per-task user log is skipped) | `src/database/user.py`, `src/database/schedule.py` `archive_live_call_tasks` |
| `live_call_tasks` | read, update (new, EL-5610) | Read filter: `patient_id` (ObjectId), `status` not `archived`; projection `_id`, `status`. Written: `status` set to `archived` by `_id` list (`Mongo.updateMany`, no `updated_at`). Whether the shared `status` vocabulary has other values: unknown here (only `archived` is defined, `LIVE_CALL_STATUS`). | `src/database/query.py` `archive_live_call_tasks_by_patient_id`, `src/utils/constants.py` |
| `manufacturer_accounts` | read (new, EL-5444) | `isActive` (true), `manufacturer`, `account`; one `$or` query for all (manufacturer, account) pairs in a flush | `src/database/query.py` `get_active_manufacturer_accounts` |
| `manufacturer_crawler_report_status` | update with `upsert=False` | `document_id` or `patient_id`, `action`, `name`, `manufacturer`, `account`, `next_send{preceding_next_send, current_next_send}`, `status` ("Fail", or new "Skipped" for in-office-only patients and for manufacturer/account pairs with no active `manufacturer_accounts` record), `error{hasError, reason}`, `event_type`, `created_at` | `log_bot_invocation`, `send_bot_event_to_sqs` |
| `billing_activity_logger` | upsert (create) | `document_id`, `collection`, `updated_at`, `$push logs`. New entry for `live_call_tasks_archived` (document is the patient id, `collection` `patients`; log holds `action` "Live Call Tasks Archived", `archived_count`, `archived_tasks[{task_id, previous_status}]`, `reason`, `updated_at`; skipped when `archived_count` is 0) | `src/events/billing_activity_logger.py` |
| `user_activity_logs` | upsert (create) | `user_id`, `document_id`, `module` ("Transmission Report"), `$push logs{url, document_id, action "Billing Date Suggested", collection_name, payload, updated_payload, error, created_at}`. New (EL-5610): module `Live Call Task` (`LIVE_CALL_TASK_MODULE`), one log per archived task with `action` "Archive Live Call Task", `document_id` = task id, `collection_name` `patients`, `updated_payload{previous_status, status "archived", action_from "Evoke"}`, pushed with `$each`, `$setOnInsert created_at`; only when the automation user exists | `src/events/user_activity_log.py`, `src/events/billing_activity_logger.py` |

Observation: `Mongo.upsert` now takes `set_on_insert` and adds `$setOnInsert` when given (`src/database/connection.py`). `Mongo.delete_many` (new, EL-5610 first commit) is defined but has no caller in `src/` or `main.py`; the live call task cleanup archives rather than deletes (see Unknowns).

Declared in constants but unused here: `hl7jobs`, `adts`, `acks`, `report_cover_pages` (`src/utils/constants.py`).

Note on `manufacturer_crawler_report_status`: `Mongo.upsert` in the failure path is called with `upsert=False` and a filter on `patient_id`, so it only updates an existing document and creates none (observed). The collection's creator is `unknown` (not this repo).

## `patients.implanted_billing_schedule` (as written by this code)

Keys `day_31`, `day_91`, `day_custom` (`BILLING_SCHEDULES`); the default constant `BILLING_CYCLE_CODES` uses space-padded keys (`'day_31 '`, `'day_91  '`) to hold several codes per cycle. Per schedule: `active`, `billing_code`, `cutoff_date`, `days` (custom cycle length), `status` (`red` late / `green` on schedule), `suspend_date`, `last_billing_date`, `last_report_date`, `estimated_cutoff_date`, `estimated_last_billing_date`, `estimated_last_report_date`, `updated_at`, `updated_by` ("AWS LAMBDA BILLING"), `billing_tasks`. Top level: `late` (bool), `billing_tasks.{first_call|second_call|third_call|letter}.{trigger_date, triggered, task_id}` (duplicated under each schedule "for backward compatibility", `src/database/schedule.py`). Who else reads these keys is `unknown` here (the portal and `rest-api-evoke` are expected to; not verified).

Billing code tables (`src/utils/constants.py`): codes 93297, 93298 (+ " 26"), 93294, 93295, 0578T, 93264; `OLD_CODE_TO_NEW` maps 93297/93298 to the " 26" form; `SEARCHABLE_BILLING_CODES` lets a lookup match both forms.

## Constants that act as data contracts

- Window sizes and cycle days: `FIRST_BILLING_DAYS`, `RECURRING_BILLING_DAYS`, `PRE_/POST_IDEAL_BILLING_WINDOW_*`, `DAY_31_OFFSET` 4, `DAY_91_OFFSET` 7, `LATE_PATIENT_OFFSET` 3, `LATE_PATIENT_NEXT_SEND_CYCLE` 7, `NEXT_SEND_OFFSET` 1.
- Late tasks trigger at late date + 2, 9, 16 (calls) and 20 (letter) days; suspend date = late date + 30 (`prepare_late_tasks_query`).
- Patients with no report in 730 days (`DAYS_OFFSET_TO_SET_PATIENT_INACTIVE`) are set `active: false` with reason "No Longer Monitoring" (`PATIENT_DEACTIVATE_REASON`). New (EL-5610): after that patient update, the patient's non-archived `live_call_tasks` are set to `status: archived` and audited (`LIVE_CALL_TASKS_ARCHIVE_REASON`: "Patient Deactivated upon reaching 730 days without transmission"). Archiving runs after `execute_billing_updates` in `update_schedule`; the archive and its audit writes use the same shared `Mongo.session` if one is open, but whether `update_schedule` always runs inside the `update_billables` transaction was not re-checked (unknown).
- Bot event contract (EL-5444, SQS message body, names only): single patient `{eventType "BOT_EVENT_TRIGGER", value <patient id>, source}`; several patients of one (manufacturer, account) `{eventType "BOT_EVENTS_TRIGGER", manufacturer, account, patient_ids[<=70], source}`; `source` is "PATIENT SCHEDULE MONITORING" (`BOT_SOURCE_IDENTIFIER`); the patient payload is reduced to `_id`, `name`, `manufacturer`, `account`, `next_send` (`BOT_EVENT_PATIENT_KEYS`). The consumer of this contract is not in this repo (unknown; the new batched `eventType` needs consumer support, not verified).
- Excluded: account `UCH` and serial numbers containing lowercase letters (`get_all_patients`); `Boston Scientific` device type `ILR` is blocked from bot events when no report was found (`MANUFACTURERS_BLOCKED_FOR_NEXT_SEND_UPDATE`).

## Transactions and consistency

- `update_billables` writes within a pymongo session and transaction (`Mongo.session`, `session.start_transaction()`); abort on exception. This requires a replica set or sharded cluster (topology `unknown`, implied by the code).
- Writes use `retry_on_write_conflict` (3 tries, sleeps 3 s times the attempt). Caveat (observed): after three failed retries the wrapper returns `None` silently and the loop exits without raising (`src/database/query.py`), so a persistent write conflict is dropped without an error.
- `get_all_patients` and the others return cursors; reads inside the transaction use the session only via the write helpers (`find`/`find_one` do not pass `session`), so reads are outside the transaction snapshot (observed in `src/database/connection.py`).
- Bot events are now sent after the whole patient loop (not per patient after commit), so they are outside any transaction and are lost if the Lambda dies before `flush_bot_events()`; the queue is a module-level list (`BOT_EVENT_QUEUE`) that is cleared on flush (observed, inferred for warm-start effects).
- `Mongo.upsert` always sends `$push` with the (possibly empty) `push_data`; an empty `$push` document is rejected by some MongoDB versions (`unknown` whether the deployed server accepts it; checked `connection.py` only).

## Unknowns

- Index definitions, DB name, cluster topology, schema validation rules.
- Behavioral difference to record (not resolved): the refresh request states live call tasks are deleted on 730-day deactivation, but at `dea0eff` this repo archives them (`status` -> `archived`) and `delete_many` is unused. `rest-api-evoke` also archives (its `data-model.md` line 78: sets non-archived tasks to `archived` with `updated_by`/`updated_at` and a user-activity entry per task); difference to note: this Lambda sets only `status`, with no `updated_at`/`updated_by` on the task (`archive_live_call_tasks_by_patient_id`). Whether the first EL-5610 commit's delete behavior was replaced deliberately: unknown (only commit subjects available, no diffs).
- Whether this Lambda is the only writer of `implanted_billing_schedule.*` and `next_send`; the sibling `manufacturer-hl7-parser` and `rest-api-evoke` knowledge should be compared during cross-repository analysis.
