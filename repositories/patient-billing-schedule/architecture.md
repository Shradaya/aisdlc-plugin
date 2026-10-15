---
repository: patient-billing-schedule
analyzed_commit: dea0eff5ed6fd7d5a9ee734cd132862a27a4fb31
analyzed_branch: main
analyzed_at: 2026-10-15T08:45:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [main.py, src/config.py, src/database/connection.py, src/database/query.py, src/database/schedule.py, src/database/inputParams.py, src/database/user.py, src/events/eventEmitter.py, src/events/billing_activity_logger.py, src/events/user_activity_log.py, src/utils/activityLogger.py, src/utils/aws.py, src/utils/slack.py, src/utils/constants.py, src/utils/date.py, src/utils/utils.py, src/utils/logger.py, bitbucket-pipelines.yml, requirements.txt, requirements-dev.txt, tests/conftest.py, .gitignore, .vscode/launch-example.json]
---

# Architecture (Phase C)

Repository location: `${AISDLC_REPO_PATIENT_BILLING_SCHEDULE}` (remote name `patient-schedule-monitoring`). Claims are `observed` (seen in code at `dea0eff` (refreshed from `ec1d889`; parts the diff did not touch were kept), file:line cited) unless tagged `[inferred]` or `unknown` (with what was checked). Secrets and env are named by variable only. Not read: `.env-example` (read was denied by tooling); its contents are `unknown`. The deployed Lambda configuration (handler path, trigger wiring, memory, timeout, VPC, IAM) is not in the repo and is `unknown`.

## 1. Shape of the system

A single Python AWS Lambda, no web server, no framework, no scheduler inside the code. It decides, per patient and per billing code, which stored cardiac-device report should be marked billable for a billing window, and maintains the patient's schedule state (next send, late status, follow-up tasks, bot trigger). One process, synchronous, sequential (no threads or async). 34 tracked files; `main.py` 329 lines, `src/database/query.py` 462, `src/database/schedule.py` 556. A `tests/` directory (pytest + mongomock, 45 test functions in 5 test files plus `conftest.py`) now exists but the pipeline does not run it (section 10).

## 2. Entry points

| Entry | Where | Detail |
|---|---|---|
| Lambda handler | `lambda_handler(event, context)` in `main.py:266` | The exported function name; the deployed handler string is `unknown` (Lambda config outside repo) but `bitbucket-pipelines.yml` zips the repo root so `main.lambda_handler` is the only plausible handler `[inferred]`. |
| CLI | `main.py:317` (`if __name__ == '__main__'`) | `python main.py --patient <patient _id>`; builds `{'patient_id': ...}` and calls `lambda_handler(event, None)`. Local-dev aid (`.vscode/launch-example.json`). `context` is `None`, so a Slack notification on error raises inside `notify_in_slack` (attribute access on `None`) and is swallowed by the outer `except` (section 8). |

Event shapes accepted by `lambda_handler` (`main.py`, handler body):

1. Direct invoke `{"patient_id": "<ObjectId string>"}`: appended to `patient_ids`. This is the shape the sibling Lambda `manufacturer-hl7-parser` sends via asynchronous invoke after storing a report (`system/repository-relationships.yaml`, human-confirmed, evidence `src/processor.py:600-606` of that repo).
2. API-style `{"body": "<json string>"}`: the body is `json.loads`-ed and replaces `event`; then only a top-level `patient_id` in that body is honoured (so `account` inside an API body is NOT read, and `Records` inside a body is not read) `[observed]`. The API caller identity is `unknown`; no API Gateway wiring is in the repo.
3. SQS `{"Records":[{"body":"<json>"}]}`: each record body is `json.loads`-ed; `account` values are collected into `accounts`, `patient_id` values into `patient_ids`. A batch can mix both. The SQS source queue, batch size, and partial-batch-response setting are `unknown`. The handler returns `None`, never `batchItemFailures`, so any record is treated as success `[observed]`.

Resolution of the patient set: for each `patient_id`, `get_patient` (active patients only); if any `accounts` were given, `get_all_patients(current_date, accounts)` adds all active patients in those accounts matching the due-ness query (section 5). No de-duplication between the two sets, so a patient named directly and also due via its account is processed twice `[inferred from code, no set/dict dedupe]`. Patients without `manufacturer` are skipped.

No scheduled trigger (EventBridge/cron) is declared in the repo. How account-wide runs are initiated (the `accounts` SQS path) is `unknown`; checked: all files, no CloudFormation/SAM/Terraform present.

## 3. Modules and responsibilities

```
main.py                    handler + billing-window orchestration
src/config.py              env/secret loading into ENV_VARS (module-scope side effect)
src/database/connection.py Mongo singleton wrapper (pymongo); adds guarded delete_many (unused outside tests)
src/database/query.py      all reads/writes against Mongo collections; retry on WriteConflict
src/database/schedule.py   per-code transaction, schedule/late/task/next-send updates, live-call-task archive on deactivation, bot-event queue (queue_bot_event) and SQS flush (flush_bot_events)
src/database/inputParams.py dataclasses UpdateBillablesContext, UpdateSchedulesContext
src/database/user.py       lookup of the automation user id (cached module global; only a found id is cached)
src/events/eventEmitter.py in-process emitter + listener registration
src/events/billing_activity_logger.py  writes billing_activity_logger collection; live_call_tasks_archived also writes per-task user_activity_logs
src/events/user_activity_log.py        writes user_activity_logs collection
src/utils/constants.py     collection names, billing codes, window/day tables, flags
src/utils/date.py, utils.py  date helpers, next-send cycle, billing-history lookup
src/utils/aws.py           SQS send helper
src/utils/slack.py         Slack webhook notification + CloudWatch log URL builder
src/utils/logger.py        root logger setup
```

Unreferenced code (observed by grep): `src/utils/activityLogger.py` (`event_logger`), `src/utils/format.py` (report/patient-name helpers), most of `src/utils/date.py` (`validate_date`, `convert_*`, `get_unix_timestamp`), `src/database/query.py` imports unused names, constants `COVER_COLLECTION`, `HL7_JOBS_COLLECTION`, `ADT_COLLECTION`, `ACK_COLLECTION`, `MANUFACTURER_BOT_INVOKE_PER_LATE_DATE_DELTA`, and `ENV_VARS.EVOKE_SLACK_URL` (loaded, never read), and `MongoConnection.delete_many` (added with EL-5610, called only from tests; live call tasks are archived, not deleted). These look copied from the HL7 parser repo `[inferred]`.

Dependency direction: `main` -> `database/schedule` -> `database/query` -> `database/connection`; `query` and `schedule` -> `events/eventEmitter` -> `events/*` -> `database/connection`; `schedule` also imports `database/user` (`get_user_id`). No cycle at import time.

## 4. Billing-window logic (structure only)

Data is driven by tables in `src/utils/constants.py`; `main.py` selects rows, `schedule.py` applies results.

- Billing codes: day-31 family `93297`, `93298` (with and without suffix ` 26`), `93264` (CardioMEMS); day-91 family `93294`, `93295`, `0578T`. `93297`/`93297 26` are the HF codes. `OLD_CODE_TO_NEW`/`SEARCHABLE_BILLING_CODES` map plain and ` 26` variants so history and report lookups match either. Note `CARDIO_MEMS_BILLING_CODES = ("93264")` is a string, not a tuple, so `in` is a substring test `[observed]`.
- Schedules: keys `day_31`, `day_91`, `day_custom` (`BILLING_SCHEDULES`). A patient's `implanted_billing_schedule` (IBS) document holds per-schedule `active`, `billing_code`, `cutoff_date`, `days`, `last_billing_date`, status, tasks. When IBS is absent, `BILLING_CYCLE_CODES` supplies defaults; multiple codes per schedule are modelled by trailing spaces in the dict keys (`'day_31 '`), stripped at use (`main.py` `get_active_schedules`, `calculate_billing`). Fragile convention.
- Per-code day tables: `FIRST_BILLING_DAYS` (days to wait after implant, cycle, pre/post days) for patients with no billing history, `RECURRING_BILLING_DAYS` (cycle 31 or 91, pre/post) for patients with history.
- Ideal billable date (per active schedule, in `calculate_billing`): first-time = signature-anchored date, else IBS `cutoff_date`, else implant date (`doi`) + wait days; recurring = signature-anchored date, else IBS `cutoff_date`, else IBS/history last billing date + cycle. Account setting `settings.billing.next_process_anchor == "signature"` (`SIGNATURE_ANCHOR`) switches the anchor to the latest report `signed_at`.
- Window (`calculate_billing_period`): ideal date minus pre-days to plus post-days; constants per case (CardioMEMS, LINQ/summary-report devices, day-31, day-91, first-time vs recurring). If today is at or past the window end, `backbill_required` is set and the window widens to `days_pre_billing_date`/`days_after_billing_date`. A `PRE_NEXT_SEND_WINDOW` (7 days) variant is used when only `next_send` has been reached.
- Early exits: before the window opens, processing continues only if `next_send`/`late_date` is reached or the patient is late; otherwise skip. Accounts whose initial-report tab for that manufacturer is not `evk_active` (read from `accounts.settings.manufacturer.<name>.initial_report_tab`) only get a `next_send` bump.
- Application (`update_billables` in `src/database/schedule.py:35`): inside one Mongo transaction per (patient, code): find a candidate report in the window (ascending report date, descending when backbilling; summary reports preferred for summary devices), reset prior billable flags, assign a unique billing date (`differentiate_existing_billing_date` adds a day if the date collides with billing history or the previous patient's date via `PERSISTED_VALUES`), set the report billable, compute next cutoff, then `update_schedule` writes patient state.
- Schedule state (`update_schedule`): next send / late date recomputation (`LATE_PATIENT_NEXT_SEND_CYCLE` 7, `LATE_PATIENT_OFFSET` 3), late status red/green, follow-up tasks (`first_call`, `second_call`, `third_call`, `letter` at +2/+9/+16/+20 days after late date, `suspend_date` +30), patient deactivation when no report exists within `DAYS_OFFSET_TO_SET_PATIENT_INACTIVE` (730 days) with reason `No Longer Monitoring`. EL-5610: when `set_patient_inactive` is true, `update_schedule` calls `archive_live_call_tasks` (`src/database/schedule.py:478`, called at line 539) inside the same transaction, after `execute_billing_updates`. It sets every non-archived `live_call_tasks` document of the patient (`patient_id`) to `status: "archived"` (`archive_live_call_tasks_by_patient_id`, `src/database/query.py:300`) and emits an audit event. Despite the commit subject ("Delete live call tasks"), the code archives and does not delete `[observed]`.

Exact day values and rules are in `src/utils/constants.py` and `main.py`; this file records structure, not a business specification. Rationale for individual constants is `unknown` (no docs, no comments beyond inline notes).

## 5. Persistence boundary

MongoDB only (`pymongo==4.6.3`; `mongoengine` is pinned in `requirements.txt` but not imported anywhere `[observed by grep]`). Database name and URI come from secrets (`DB_URI`, `DATABASE_NAME`). Access goes through the `MongoConnection` singleton (`src/database/connection.py`), created at import time (`Mongo = MongoConnection()` at module end), which calls `server_info()` so an unreachable DB fails the Lambda cold start/import rather than the handler.

| Collection (constant) | Access | Purpose |
|---|---|---|
| `patients` | read, update (`$set`/`$push` via `upsert`, `upsert=False`) | schedule state, `next_send`, `late_date`, `implanted_billing_schedule`, `billingHistory`, `active`, `next_bill_date` |
| `reports` | read, update | candidate reports; sets `billable`, `report_billing_date`, `evk_*` flags, `moved_for_backbill`, `updated_by` |
| `devices` + `device_types` | aggregate read | device model -> `summary_report`, short type |
| `accounts` | aggregate read | initial report tab, billing anchor setting |
| `tasks` | insert, archive | automated no-show follow-up tasks |
| `live_call_tasks` | read (`patient_id`, status not archived), `update_many` by `_id` list setting `status: archived` | EL-5610: closed when a patient is deactivated at 730 days; the update passes the session, the preceding `find` does not |
| `manufacturer_accounts` | read (`isActive`, `manufacturer`, `account`) | EL-5444: one `$or` query per flush decides which (manufacturer, account) groups get a bot event (`get_active_manufacturer_accounts`, `query.py:333`) |
| `users` | read | id of user named `EVOKE AUTOMATED NOTES` (hard-coded in `src/database/user.py`) for activity logs |
| `billing_activity_logger` | upsert + `$push` logs | audit of next-send/billing/bot actions; EL-5610 adds a `Live Call Tasks Archived` entry (`action`, `archived_count`, `archived_tasks`, `reason`) via event `live_call_tasks_archived` |
| `user_activity_logs` | upsert + `$push` logs | "Billing Date Suggested" entry for the report; EL-5610 adds one `Archive Live Call Task` log per archived task (module `Live Call Task`, `action_from: Evoke`), written only when the automation user id resolves |
| `manufacturer_crawler_report_status` | update (`upsert=False`) | bot status per patient: `Bot Event Queued...` action on success, `Fail` or `Skipped` record with reason otherwise. With `upsert=False` a write only lands if a status document for the filter already exists `[observed]` |

Transactions: `update_billables` opens `Mongo._client.start_session()` and a transaction, sets `Mongo.session`, and all write helpers pass `session=self.session`; `find`, `find_one`, `aggregate` do NOT pass the session (including the `find` inside the live-call-task archive), so reads inside the transaction are not snapshot-isolated `[observed]`. Commit at end; on any exception the transaction aborts and the exception is re-raised. `MongoConnection.session` is process-global state. Whether the Mongo deployment is a replica set (required for transactions) is `unknown`.

Concurrency: write conflicts are retried up to `MAX_RETRIES` 3 with growing sleep (`retry_on_write_conflict`). Note the wrapper returns `None` after exhausting retries without raising (loop falls through), so a persistent conflict is silently dropped `[observed]`. Concurrent Lambda executions for the same patient have no lock `[inferred]`.

Shared-database coupling: same Mongo as `rest-api-evoke` and `manufacturer-hl7-parser` (`repositories/rest-api-evoke/change-impact.md`); collection ownership is not declared here.

## 6. Configuration flow

`src/config.py` runs at import:

1. If a local `.env` file exists (path relative to working directory), parse `KEY=VALUE` lines into `ENV_VARS` and set `ENV_VARS.local = True`. Lines containing more than one `=` break parsing (`split('=')` unpacking) `[observed]`; `.env` is git-ignored.
2. Otherwise read env vars `SM_REGION` and `SM_NAME`, fetch a Secrets Manager secret, and map keys: `DB_URI`, `DATABASE_NAME`, `SLACK_URL` (stored as `ENV_VARS.LF_SLACK_URL`, development team channel), optional `EVOKE_SLACK_URL` (unused), optional `MANUFACTURER_BOT_SQS_URL`.

Cached for the container lifetime; secret rotation requires a cold start. A failing `get_secret_value` raises at import (no handling). `.env` local-mode variable names beyond the above are `unknown` (`.env-example` not read). The `ENV_VARS` dotdict returns `None` for missing keys, so a missing `MANUFACTURER_BOT_SQS_URL` silently disables the bot event.

AWS credentials: Lambda execution role (for Secrets Manager and SQS) `[inferred]`; role permissions are `unknown`.

## 7. Async and event boundaries

Inbound: the three event shapes in section 2 (async Lambda invoke from the parser; SQS; API-style body).

Outbound:

- SQS bot event (EL-5444, rewritten). `update_billables` no longer sends per patient; after the transaction commits it calls `queue_bot_event(patient, next_send)` (`src/database/schedule.py:332`), which appends a reduced patient dict (`BOT_EVENT_PATIENT_KEYS`: `_id`, `name`, `manufacturer`, `account`, `next_send`) to the module-global `BOT_EVENT_QUEUE` and sets `PERSISTED_VALUES['bot_lambda_invoked']`. Patients with `information.in_office_only` true are not queued (recorded `Skipped`). Trigger conditions are unchanged (`late_date` exists, `next_send` reached, device/manufacturer exclusion, once per patient per run). `flush_bot_events()` (`schedule.py:392`) runs at the end of the handler: groups by `(manufacturer, account)`, drops groups without an active `manufacturer_accounts` record (recorded `Skipped` per patient, no SQS), then sends chunks of at most `BOT_EVENT_MAX_PATIENT_IDS` = 70 patients via `send_sqs_message` (`src/utils/aws.py`) to `MANUFACTURER_BOT_SQS_URL`.
  - Single-patient chunk: `{"eventType":"BOT_EVENT_TRIGGER","value":"<patient _id>","source":"PATIENT SCHEDULE MONITORING"}`, FIFO `MessageGroupId` = patient id.
  - Multi-patient chunk (new shape): `{"eventType":"BOT_EVENTS_TRIGGER","manufacturer":"<m>","account":"<a>","patient_ids":["<id>",...],"source":"PATIENT SCHEDULE MONITORING"}`, FIFO `MessageGroupId` = `<manufacturer>:<account>`. FIFO queues (URL ends `.fifo`) still get a random `MessageDeduplicationId`, so no real deduplication.
  - Result per patient: `_is_sqs_send_ok` needs HTTP 200 and a `MessageId`; success writes a `Bot Event Queued` status, anything else (including a caught exception) writes a `Fail` record. No retry, no Slack alert.
  - Events sit in process memory until the flush: a Lambda timeout or crash before it loses them with no record `[inferred]`. Consumer (manufacturer crawler bot) is outside this repo and `unknown`; whether it understands `BOT_EVENTS_TRIGGER`, `patient_ids` and `source` is `unknown` (see `change-impact.md`). Sender-side comparison: `rest-api-evoke` sends `{eventType:"BOT_EVENT_TRIGGER", value:<patientId>}` (no `source`) to its `AWS_BOT_QUEUE_URL` (`repositories/rest-api-evoke/architecture.md`); whether that is the same physical queue as `MANUFACTURER_BOT_SQS_URL` is `unknown` (URLs live in secrets/env).
- Slack webhook (section 8).
- Mongo log writes via in-process events (below).

In-process events (`src/events/eventEmitter.py`): a synchronous emitter (`emit` calls listeners inline, no queue, no error isolation) with listeners registered at import: `next_send_update` -> `billing_activity_logger`; `billing_date_assigned` -> `user_activity_log.billing_date_assigned` and `report_billed`; `bot_lambda_invoked` -> `bot_lambda_invoked`; `live_call_tasks_archived` -> `live_call_tasks_archived` (EL-5610, registered in `eventEmitter.py:33`). Emitted from `src/database/query.py` (`set_billable_true`, `execute_billing_updates`, `log_bot_invocation`) and `src/database/schedule.py` (`archive_live_call_tasks`). Because listeners run inline within the open transaction (using `Mongo.session`), a listener failure aborts the whole code's update (now including the live-call-task archive audit write). `log_bot_invocation` calls made by the flush run outside any transaction (`Mongo.session` is `None`).

Module global mutable state across patients in one invocation: `PERSISTED_VALUES` (reset after each patient by `update` with a deep copy of defaults, `main.py` handler loop), `BOT_EVENT_QUEUE` (EL-5444; module-level list, emptied by each flush), `user_id` cache in `src/database/user.py`. Warm Lambda containers reuse these globals `[inferred]`.

Scheduled jobs / background workers: none in the repo.

## 8. Failure handling and Slack notification

- Per patient: `calculate_billing` wraps its body in `try/except Exception`, logs the traceback, and returns the string `"<serial> <---> <error>"` instead of raising. The handler collects these into `errors`. Processing continues with the next patient. A failure for one code aborts that patient's remaining codes (exception leaves the schedule loop).
- Per transaction: abort and re-raise (`update_billables`), which lands in the per-patient handler above.
- After the loop: if `errors`, `notify_in_slack(context, joined_messages)` posts one message to the webhook in `ENV_VARS.LF_SLACK_URL` containing function name, the error text in a code block, and a CloudWatch log-stream link built from `context.invoked_function_arn`, `log_group_name`, `log_stream_name` (`src/utils/slack.py`). `requests.post` has no timeout, no retry, no status check beyond `print`. Error text includes patient serial numbers (identifiers sent to Slack; PHI sensitivity is a review point `[inferred]`).
- Top level: the whole handler body is inside `try/except Exception` that only logs (`log.info(e)`), then returns `None`. Result: the Lambda reports SUCCESS to the invoker even on fatal errors (e.g. bad JSON, DB failure in `get_patient`, Slack failure), so Lambda retries, DLQ, and SQS redrive never trigger from code failures `[observed]`. Import-time failures (secrets, Mongo connection) do surface as invocation errors.
- Bot SQS failure: an exception from `send_sqs_message` is caught per chunk and logged, a non-OK response logs the patient ids, and each patient in the chunk gets a `Fail` record via `_log_bot_event_failure` (no Slack alert, no retry). EL-5444 `finally`: the handler's `finally` calls `flush_bot_events()` again inside its own `try/except` that logs `Failed to flush bot events`, so events queued before a fatal error in the main body are still sent; on the normal path the queue is already empty and the second call is a no-op (`main.py:300-314`).
- Handler still returns `None` and the top-level `except` still only logs. No metrics, tracing, health checks, or idempotency keys. Logging is plain `logging` at INFO to the Lambda log group (`src/utils/logger.py`); payloads such as the period dict and patient fields are logged (log content sensitivity `inferred`).
- Time: `get_current_date()` uses server-local `datetime.now()` truncated to midnight, naive datetimes; the Lambda timezone is normally UTC `[inferred]`, so "today" is a UTC date. The Lambda timeout versus the number of patients per account run is `unknown`.

## 9. Authentication and authorization

None in code. The Lambda has no inbound auth logic (trusts invoker via IAM, `inferred`), no user identity. Writes are attributed to strings (`"Evoke Automated Schedule Monitoring Lambda"`, `"AWS LAMBDA BILLING"`, `"Automated Schedule Monitor Lambda"`) and to the `EVOKE AUTOMATED NOTES` user for activity logs. Mongo and Slack credentials come from Secrets Manager (names above; values never recorded).

## 10. Build and deploy (architecture-relevant)

`bitbucket-pipelines.yml`: branch `lf-qa`, `lf-uat`, `main` each zip the working directory (deleting `.gitignore`, the pipelines file, and `.git` first), upload to S3 (`$DEV_LAMBDA_RESOURCE_BUCKET` or `$PROD_LAMBDA_RESOURCE_BUCKET`), and run `aws lambda update-function-code ... --publish` for `$QA_LAMBDA_NAME`, `$UAT_LAMBDA_NAME`, `$PROD_LAMBDA_NAME` using Bitbucket OIDC (`$AWS_ROLE_ARN`). Pushing to `main` deploys to production with no test, lint, or approval step in the pipeline (the new `tests/` suite and `requirements-dev.txt` are not wired in; no pytest step in `bitbucket-pipelines.yml`). Dependencies are NOT installed in the pipeline: the zip contains only repo files, so `requirements.txt` packages (`pymongo`, `requests`, `python-dateutil`, etc.) must come from a Lambda layer or the base image, which is `unknown`. `requirements.txt` is UTF-16 encoded (pip needs it as such or may fail) `[observed]`. Python runtime version `unknown`.

## 11. Unknowns summary

- Lambda handler string, runtime, timeout, memory, concurrency limit, VPC, role, layers, environment variables (infra not in repo).
- Triggers: SQS queue name/DLQ/batch settings, any EventBridge schedule, API Gateway, and who sends `accounts` messages.
- Contents of `.env-example` (read denied).
- Mongo topology (replica set), indexes, and document schema ownership (no schema files; only fields touched by queries are known).
- Bot SQS consumer behavior and queue type (FIFO or standard); whether it accepts `BOT_EVENTS_TRIGGER`, `patient_ids` and `source`; whether `MANUFACTURER_BOT_SQS_URL` equals `rest-api-evoke`'s `AWS_BOT_QUEUE_URL`.
- Whether `rest-api-evoke` or the portal read `live_call_tasks` and handle the `archived` status written here.
- Whether `manufacturer-hl7-parser` is the only direct-invoke caller (confirmed for that repo only).
