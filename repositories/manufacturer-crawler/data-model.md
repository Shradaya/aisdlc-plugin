---
repository: manufacturer-crawler
analyzed_commit: d6aa388a03c12e777846a704818ba5903a021a4f
analyzed_branch: main
analyzed_at: 2026-10-15T08:55:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [database/connection.py, database/db_secret.py, database/getPatient.py, database/getReports.py, database/getDocument.py, database/insertDocument.py, database/updateDocument.py, database/export.py, database/noShowRecord.py, database/run_aggregation.py, utils/accounts.py, utils/config.py, utils/exportToS3.py, eventHandler/cron_job.py, eventHandler/recrawl.py, eventHandler/bot_trigger.py, eventHandler/bot_triggers.py, eventHandler/disconnected_monitors.py, main.py, manufacturer/Biotronik/biotronik.py, manufacturer/Abbott_Merlin/utils.py, manufacturer/Medtronic_Carelink/utils.py, manufacturer/Medtronic_Carelink/trackAlert.py]
---

# manufacturer-crawler: Data model (Phase F)

Names only; no values. The repo defines no schemas or models: it uses raw pymongo against a MongoDB database shared with other Evoke services. Database name and URI come from the Secrets Manager secret keys `DATABASE_NAME` and `DB_URI` (`database/connection.py`; secret name and region from env `SM_NAME`, `SM_REGION`). The client is created per event (`setConnection`) and never closed explicitly. Field lists are the fields this code reads or writes, not full documents. Schemas, indexes and owners live elsewhere (likely `rest-api-evoke`; not verified here).

## Collections accessed

| Collection | Access | Fields used | Evidence |
|---|---|---|---|
| `manufacturer_accounts` | read; update one | Read (`find` with `isActive: true`, `manufacturer $in`, optional `account`): `manufacturer`, `account`, `username`, `password` (stored as a JWT wrapping AES ciphertext; decoded in memory, see `security.md`), `isActive`, `isILRDevices`, plus other fields passed through to the crawlers (not enumerated, for example the Biotronik user group). Written by `setAccountsAsHalted` filtered on `manufacturer`, `account`, `username`: `$set isActive false`, `schedule false`, `haltInfo{haltedBy "Bot", haltedReason, haltedAt}`. | `database/db_secret.py`, `main.py` `process_event`, `utils/accounts.py`, `manufacturer/Biotronik/biotronik.py` |
| `patients` | read only (`find_one`, `find`, aggregation); no write found | Filters and reads: `_id`, `manufacturer`, `account`, `active`, `next_send`, `serial_number`, `name`, `dob`, `evoke_id`, `deviceInformation.modelNumber`, `information.in_office_only` (missing or false means crawlable). Aggregation `$lookup` from `reports` on `patient_serial_num` = `serial_number`. The crawler changes next send in the manufacturer portal; the code found here does not update `patients.next_send` (grep for update calls: only `updateRecords` on `reports`). Who updates it afterwards: `unknown`. | `database/getPatient.py`, `eventHandler/*`, `eventHandler/cron_job.py` |
| `reports` | read; update many by `_id` | Read: `report_date` (last 24 h), `manufacturer`, `account`, `billing_code` (excluded `93297`, `93297 26`), `device_category`, `summary_report_flag`, `last_billing_date`, `patient_serial_num`, `device_serial_number`, `name` (regex "(HF)"), `_id`. Written by `updateRecords`: `$set transmission_alert_information{alert_priority, alert_description}` on the report and its same-day HF reports (Medtronic `trackAlert.py`; Abbott `transmission_crawler.py` line 516). | `database/getReports.py`, `database/updateDocument.py`, `eventHandler/cron_job.py`, `manufacturer/Medtronic_Carelink/trackAlert.py` |
| `manufacturer_crawler_report_status` | read; upsert by replace | One document per patient (replace filter `{"patient_id": <str>}`): `patient_id` (string), `name`, `manufacturer`, `account`, `next_send{preceding_next_send, current_next_send}` (datetime, or a `%d-%b-%Y` string in older documents, normalized in the `cron_job.py` pipeline), `status` (Fail, Success, Not Found, In Progress, Already Exported, Already Scheduled, Already Transferred), `error{hasError, reason}`, `event_type`, `created_at`. Because writes replace the whole document, there is one latest document per patient (history is not kept, observed); `created_at` is the latest attempt. `generate_log` returns `None` when the patient lookup fails and `insert_or_replace_document` skips `None`. | `database/export.py`, `database/insertDocument.py`, `eventHandler/recrawl.py`, `eventHandler/cron_job.py`, `main.py` |
| `manufacturer_crawler_account_status` | read; upsert by replace | Filter `{manufacturer, account}`: `manufacturer`, `account`, `crawl_status{status, crawled_upto, password_expired, password_expired_at}` (status Fail, Success or In Progress). Read by recrawl for status in (Fail, In Progress) and `crawled_upto` within 30 days. Replace overwrites any other fields in that document (observed). | `manufacturer/*/utils.py`, `manufacturer/*/patient_crawler.py`, `manufacturer/Boston_Scientific/boston.py`, `eventHandler/recrawl.py` |
| `biotronik_exported_reports` | read; upsert by replace | `_id` (= patient `_id`), `name`, `account`, `serial_number` (from `deviceInformation.modelNumber`), `exported_at`. Read for "exported today" (`exported_at` in the UTC day) to skip patients. | `manufacturer/Biotronik/biotronik.py`, `eventHandler/cron_job.py` |
| `noshow_disconnected_logs` | read; upsert by replace | `manufacturer`, `account`, `account_type` (optional), `status` (Success or Fail), `updated_at`, `s3_key`, `event` (the full input event), `failed_reason` (contains the Lambda public IP, from `api.ipify.org`, plus the exception text). Replace filter `{manufacturer, account, status, account_type?}`, so at most one Success and one Fail document per account. Reader `log_failed_noshow_records` is unused. | `eventHandler/disconnected_monitors.py`, `database/noShowRecord.py` |

Not accessed: `tasks`, `users`, `live_call_tasks`, `devices` (grep over `database/`, `eventHandler/`, `manufacturer/`, `main.py`).

## Shared-database ownership

All of the collections above are written or read by name only. Given `manufacturer_accounts`, `patients` and `reports` are domain collections also used by the web back end and by `patient-billing-schedule` (which reads `manufacturer_accounts` and updates `manufacturer_crawler_report_status`, per that repo's package), this repo is a writer to: `manufacturer_crawler_report_status`, `manufacturer_crawler_account_status`, `biotronik_exported_reports`, `noshow_disconnected_logs` (creator presumably this repo, since it upserts; `unknown` whether another service reads them), plus partial writers to `manufacturer_accounts` (halting) and `reports` (alert info). Owner of the schemas for `patients`, `reports`, `manufacturer_accounts`: `unknown` from this repo. Contract risk: the halt update changes `isActive`, which `patient-billing-schedule` filters on.

## Indexes

`unknown`. Checked: no `create_index`, `createIndex` or schema validation anywhere in the repo. Queries that would depend on indexes: `manufacturer_crawler_report_status` by `patient_id` (replace filter and the `$lookup` in `cron_job.py`), `reports` by `report_date` plus `manufacturer`, `patients` by `serial_number` and `next_send`, `manufacturer_crawler_account_status` by `{manufacturer, account}`.

## S3 layout

Bucket from env `PROCESSED_BUCKET` (name not in the repo). `utils/exportToS3.py` uploads either JSON (`put_object`, `application/json`) or a file.

| Key pattern | Content | Evidence |
|---|---|---|
| `${S3_NOSHOW_KEY_PREFIX}/<Manufacturer_with_underscores>/[<account_type lowercase>/]<YYYY-MM-DD>/<account_abbr>_<YYYY-MM-DD_HH-MM-SS>.json` | disconnected-monitor result: the helper response (`hasError`, `data` list of monitors, Boston NXT and Clarity sections) plus `manufacturer`, `account`. Prefix value is an env value (`unknown`). Content per monitor is whatever each portal crawler returns (patient-level data; fields not enumerated here). | `eventHandler/disconnected_monitors.py` |
| `manufacturer-bot-crawler/screenshots/<YYYY/MM/DD>/snapshot_<timestamp>.png` | screenshot of the portal page (`/tmp/snapshot.png`) uploaded when an error is sent with a snapshot format; timestamp fixed at container start | `utils/config.py`, `utils/slack.py` `_try_export_snapshot_to_s3` |

No lifecycle, encryption or versioning settings are visible (`unknown`). Reports themselves are not uploaded by this repo.

## Transactions and consistency

- No transactions, sessions or `retry` wrappers anywhere (grep for `start_session`, `transaction`: none). Each helper is a single operation.
- `insert_or_replace_document` uses one `bulk_write` (pymongo default ordered) of `ReplaceOne(..., upsert=True)`; replace semantics overwrite any fields not written by this code. It catches and returns False on any error (a Slack message is sent), so callers usually continue after a failed write (observed).
- Helpers swallow exceptions and return `None` (for example `fetchPatient`, `fetchDocument`, `getSecret`) after a Slack message; callers such as `activeAccounts(manufacturer_secrets)` then raise on `None` (observed in `main.py` and `utils/accounts.py`).
- Concurrency: concurrent invocations for the same patient or account race on the replace upserts; no locks (inferred).
- `manufacturer_crawler_report_status.next_send.*` stores datetimes in newer writes and strings in older ones; the cron pipeline normalizes strings with `$dateFromString` (`%d-%b-%Y`) (observed).
