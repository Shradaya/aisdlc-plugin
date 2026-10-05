---
repository: patient-billing-schedule
analyzed_commit: ec1d8894c633996d7fc9e7a9423d21521a981bf6
analyzed_branch: main
analyzed_at: 2026-10-05T00:00:00Z
generator: aisdlc@1.0.0
status: inferred
confidence: medium
evidence: [main.py, src/config.py, src/database/connection.py, src/database/query.py, src/database/schedule.py, src/database/inputParams.py, src/database/user.py, src/events/eventEmitter.py, src/events/billing_activity_logger.py, src/events/user_activity_log.py, src/utils/constants.py, src/utils/utils.py, src/utils/date.py, src/utils/aws.py, src/utils/slack.py, bitbucket-pipelines.yml, requirements.txt, system/repository-relationships.yaml]
---

# Change-impact map (Phase K)

Repository: `${AISDLC_REPO_PATIENT_BILLING_SCHEDULE}`. Tags: `[observed]` seen in code at `ec1d889`; `[inferred]` reasoned from code. Consumers and producers outside this repository are `unknown` unless named in `system/repository-relationships.yaml` (only the parser to this Lambda direct-invoke link is recorded there, as `billing-schedule-lambda`, human-confirmed). Fan-in below is counted by import/grep across the 27 tracked files. There is no test suite in the repo, so nothing guards any change below `[observed]`.

## 1. Contracts that must stay in sync

| Contract | Where | What breaks if changed |
|---|---|---|
| Handler signature and event shapes: `{patient_id}`, `{body: "<json {patient_id}>"}`, `{Records:[{body:"<json {account?, patient_id?}>"}]}` | `main.py` `lambda_handler` | Callers (the `manufacturer-hl7-parser` Lambda invokes with `{patient_id}`, human-confirmed; SQS/API producers `unknown`). Renaming `patient_id`/`account` silently yields "no patients processed" with a success return `[observed]`. |
| Secret key names `DB_URI`, `DATABASE_NAME`, `SLACK_URL`, `EVOKE_SLACK_URL`, `MANUFACTURER_BOT_SQS_URL`; env `SM_REGION`, `SM_NAME` | `src/config.py` | Missing DB keys crash at import; missing bot URL silently disables bot events; `SLACK_URL` missing breaks error alerts. Secret lives outside the repo. |
| Bot SQS message `{"eventType":"BOT_EVENT_TRIGGER","value":"<patient id>"}`, FIFO group id = patient id | `src/database/schedule.py:318`, `src/utils/aws.py` | The manufacturer crawler bot consumer (`unknown`) parses these keys. Same camelCase style as the `rest-api-evoke` queues, but a different event name. |
| Patient document fields: `doi`, `account`, `manufacturer`, `serial_number`, `device`, `deviceInformation.modelName`, `billingHistory[]` (`billing_code`, `billing_date`), `next_send`, `late_date`, `next_send_cycle`, `created_at`, `last_bill_date`, `information.{physicians,phone1,phone2}`, `implanted_billing_schedule.*` (`late`, `billing_tasks`, per schedule `active`, `billing_code`, `cutoff_date`, `days`, `last_billing_date`, `last_report_date`, `estimated_*`, `status`, `suspend_date`, `updated_at/by`), `next_bill_date`, `explicit_next_bill_date`, `active`, `deactivate_info` | `src/database/query.py` (projections and updates), `src/database/schedule.py` | Written here and read by the portal API and parser. Schema owner is unknown; `rest-api-evoke` maps `patients` with three models (`repositories/rest-api-evoke/change-impact.md`). The projection lists in `get_patient` and `get_all_patients` are explicit, so a new field used in logic must be added to BOTH or it is silently `None` `[observed]`. |
| Report document fields: `patient_serial_num`, `device`, `billing_code`, `report_date`, `evk_active`, `evk_archived`, `evk_processed`, `moved_for_backbill`, `summary_report_flag`, `signed_at`, `last_billing_date`, `billable`, `report_billing_date`, `clinic_for_review`, `updated_by` | `src/database/query.py` | Written by the parser (creation) and `rest-api-evoke` (review workflow). This Lambda flips `billable`, billing date, and workflow flags back to the "active" state (`set_billable_true`), which feeds the portal's billing views. |
| Account settings `settings.manufacturer.<manufacturer lowercased, spaces to underscores>.initial_report_tab.{hf,regular}` (value `evk_active`), `settings.billing.next_process_anchor` (`signature`) | `get_initial_report_tab_for_account_manufacturer`, `get_account_billing_anchor` | Renaming settings paths silently changes behavior: missing tab => account treated as archived (only `next_send` bump); missing anchor => `billing`. |
| Device lookup `devices.modelName`, `summary_report`, `deviceTypeId` -> `device_types.shortName` | `get_device_info` | Drives LINQ-style summary-report windows and Boston Scientific ILR exclusion. Unknown model => empty dict => defaults. |
| Automation user named `EVOKE AUTOMATED NOTES` | `src/database/user.py`; same lookup by name in `rest-api-evoke` (`repositories/rest-api-evoke/change-impact.md` section 2) and the parser | If the user is renamed or deleted: activity logs here get `user_id: None` silently, and the API's service auth and Clinii flows break. Cached in a module global per container. |
| Written-by markers `"Evoke Automated Schedule Monitoring Lambda"` (reports), `"AWS LAMBDA BILLING"` (patient IBS), `"Automated Schedule Monitor Lambda"` and `automated_scheduling: true` (tasks) | `query.py`, `schedule.py` | Portal/reporting may filter on these strings `[inferred]`; consumers `unknown`. |
| Task document shape (`description` template with NAME/DOB/MANUFACTURER/..., `status: "To Do"`, `patient{_id,name,serial_number}`, `archived`, `account`) | `create_task` | `rest-api-evoke` task views and live-call tasks read `tasks` `[inferred]`. Description text is human-facing and also holds PHI. |
| Log collections `billing_activity_logger`, `user_activity_logs` (module `Transmission Report`, action `Billing Date Suggested`), `manufacturer_crawler_report_status` | `src/events/*`, `query.py` | Shared audit/status collections; `user_activity_logs` shape must match the API's activity logger (`rest-api-evoke` section 1). Bot status collection has another writer (the bot, `unknown`). |

## 2. Central constants and rules (highest blast radius)

`src/utils/constants.py` is imported by `main.py`, `schedule.py`, `query.py`, `utils.py`, `user.py`, `activityLogger.py`, event modules (about 8 importers) and holds all business numbers. Changing a value changes billing behavior for every patient on the next run with no feature flag or migration:

| Item | Effect |
|---|---|
| `FIRST_BILLING_DAYS`, `RECURRING_BILLING_DAYS` | cycle length, wait-after-implant, backbill widths per code; must stay keyed by every code used in `DAY_31_BILLING_CODES`/`DAY_91_BILLING_CODES`, else `KeyError` for that patient (caught, reported to Slack). |
| `PRE_/POST_IDEAL_BILLING_WINDOW_*`, `PRE_NEXT_SEND_WINDOW` | the billable window per category in `calculate_billing_period` (`main.py`). |
| `BILLING_CYCLE_CODES` (trailing-space key trick) and `BILLING_SCHEDULES` | adding a code or schedule needs a new unique key variant, `.strip()` handling in `main.py`, `get_active_schedules`, `get_next_send_cycle`, and IBS data shape in the portal. |
| `OLD_CODE_TO_NEW`, `SEARCHABLE_BILLING_CODES` | equivalence of `93297`/`93297 26`, `93298`/`93298 26`; a new code needs entries here or `get_report` passes `None` to `$in` (`SEARCHABLE_BILLING_CODES.get(billing_code)` has no default in `get_report`, unlike `get_latest_signed_report_date`) `[observed]`. |
| `CARDIO_MEMS_BILLING_CODES = ("93264")` | a string, so `in` is a substring test; adding codes as a tuple requires care, and any substring of `93264` would match `[observed]`. |
| `DAY_31_OFFSET`, `DAY_91_OFFSET` | account-run due-ness query horizon (`get_all_patients`); also `NEXT_SEND_OFFSET`, `LATE_PATIENT_OFFSET`, `LATE_PATIENT_NEXT_SEND_CYCLE`, `DAYS_OFFSET_TO_SET_PATIENT_INACTIVE` (730, deactivates patients). |
| `MANUFACTURERS_BLOCKED_FOR_NEXT_SEND_UPDATE`, `MDT/BSX/ABT/BIO` | manufacturer and device-type rule for bot triggering. `MANUFACTURER_BOT_INVOKE_PER_LATE_DATE_DELTA` is unused. |
| Collection-name constants | renames break all shared-DB peers. Several are dead (`COVER_COLLECTION`, `HL7_JOBS_COLLECTION`, `ADT_COLLECTION`, `ACK_COLLECTION`). |

## 3. Change by area

| Area changed | Files directly affected | Also affected / check | Tests |
|---|---|---|---|
| Handler event parsing (`lambda_handler`) | `main.py` | the parser (direct invoke), any SQS/API producer (`unknown`); the `body` branch ignores `account`/`Records`, SQS branch ignores a top-level `patient_id`; return value is always `None` | none exist |
| Ideal-date and window logic (`calculate_billing`, `calculate_billing_period`) | `main.py`, `constants.py` | `update_billables` consumes `ideal_period_*`, `backbill_required`; `get_all_patients` due-ness query must still select the patients this logic would act on; portal displays of cutoff/next-bill dates | none; add cases per code x (first-time, recurring) x (summary device, CardioMEMS) x backbill |
| Billing-date assignment and report flagging (`update_billables`, `set_billable_true/false`, `differentiate_existing_billing_date`) | `src/database/schedule.py`, `query.py` | billing history on `patients`, report review flags in the portal, `reports.report_billing_date` consumers (billing export, `unknown`); `PERSISTED_VALUES` cross-patient date de-collision | none |
| Late/next-send/task logic (`update_schedule`, `prepare_*`, `amend_task_records`) | `schedule.py`, `utils.py` (`get_next_send_cycle`) | `tasks` collection creation and archival, IBS `billing_tasks` structure (written under two paths for backward compatibility; both must stay in sync), patient inactive flag. `amend_task_records` indexes `billing_tasks[previous_call]` without default and compares `trigger_date > current_date` without a None check, so malformed task state raises per patient `[observed]`. `get_next_send_cycle` returns after the first schedule in its loop (early `return DEFAULT_DAYS` inside the loop) `[observed]`. | none |
| Account due-ness query (`get_all_patients`) | `query.py` | excludes account `UCH` (hard-coded) and serial numbers containing lowercase letters; changes the SQS-driven workload and Lambda duration | none |
| Mongo access layer (`MongoConnection`, `retry_on_write_conflict`) | `connection.py`, `query.py` | every module (all writes pass `Mongo.session`; reads do not); retry wrapper returns `None` after exhaustion; global `Mongo.session` is shared state, not safe for threads | none |
| Event emitter and loggers | `eventEmitter.py`, `events/*` | listeners run inside the transaction; adding a failing listener aborts billing updates; `activityLogger.event_logger` is unused | none |
| Bot SQS and Slack (`aws.py`, `slack.py`, `send_bot_event_to_sqs`) | `schedule.py`, `aws.py`, `slack.py` | bot consumer (`unknown`), FIFO assumptions (random dedup id), Slack webhook and `context` attributes (CLI passes `None`) | none |
| Config and secrets (`config.py`) | all modules (import-time) | Lambda env `SM_REGION`/`SM_NAME`, secret key names, local `.env` parsing (`split('=')`, breaks on values containing `=`) | none |
| Pipeline and packaging (`bitbucket-pipelines.yml`, `requirements.txt`) | deploy only | `main` deploys to production Lambda directly; zip excludes installed packages (layer assumed, `unknown`); `requirements.txt` UTF-16; `mongoengine` pinned but unused | none |

## 4. Hotspots

1. `main.py` `calculate_billing` (about 100 lines, deeply nested, mutates the `patient` variable and re-fetches it per schedule) and `src/database/schedule.py` `update_billables`/`update_schedule` (435 lines total): most logic, no tests, behavior depends on ordering and module-global `PERSISTED_VALUES`.
2. `src/utils/constants.py`: all business numbers; many near-duplicate per-code dicts.
3. `src/database/query.py` (418 lines): every Mongo query, including two parallel projection lists.
4. The `implanted_billing_schedule` document: dual-written paths (`implanted_billing_schedule.billing_tasks` and `implanted_billing_schedule.<schedule>.billing_tasks`) for backward compatibility; consumers `unknown`.
5. Pipeline: single-step deploy to production from `main`.

## 5. Behavior quirks to know before changing (all `[observed]`)

- Top-level `try/except` in `lambda_handler` swallows all errors and returns success; the only failure signal is Slack (needs `context`) plus logs.
- Duplicate processing is possible when `patient_id` and its `account` are both supplied (no de-duplication).
- `retry_on_write_conflict` silently returns `None` after the last conflict.
- SQS FIFO dedup id is random, so duplicate bot events are not suppressed.
- Bot send happens after commit; a failed send is recorded but not retried.
- Reads inside the transaction are not bound to its session.
- Today is computed from the server clock, naive and local-time based.

## 6. Who else to check before changing

- `manufacturer-hl7-parser` (registered): invokes this Lambda with `{patient_id}`; shares Mongo collections `patients`, `reports`, `user_activity_logs`; sends a different CREATE_PATIENT event family. Read `repositories/manufacturer-hl7-parser/change-impact.md`.
- `rest-api-evoke` (registered): maps the same `patients`, `reports`, `tasks`, `users`, `accounts`, `devices`, `user_activity_logs` collections; role of billing dates in the portal.
- `evoke-portal-front-end` (registered): displays `next_bill_date`, schedule status, tasks (`inferred`; not read).
- The manufacturer crawler bot consumer, the SQS/API producers for the `accounts` and `body` paths, the Lambda infrastructure repository, and downstream billing export: all `unknown`, no registered repo. Record confirmed relationships in `system/repository-relationships.yaml` (the entry names this repo as `billing-schedule-lambda`, `target_registered: false`; update it once the registry name `patient-billing-schedule` is confirmed).

## 7. Tests and validation

No tests, linters, type checking, or CI checks exist in the repo (observed: no `tests/`, no config files, pipeline has deploy steps only). Validation of any change needs a developer-prepared test Mongo and a dry run through the CLI (`python main.py --patient <id>`, needs a local `.env`; this writes to whatever database it points at, so never run it against production data). No test commands were run during onboarding.
