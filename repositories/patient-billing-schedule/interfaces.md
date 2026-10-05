---
repository: patient-billing-schedule
analyzed_commit: ec1d8894c633996d7fc9e7a9423d21521a981bf6
analyzed_branch: main
analyzed_at: 2026-10-05T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [main.py, src/config.py, src/database/connection.py, src/database/query.py, src/database/schedule.py, src/database/user.py, src/events/eventEmitter.py, src/events/billing_activity_logger.py, src/events/user_activity_log.py, src/utils/aws.py, src/utils/slack.py, src/utils/constants.py, bitbucket-pipelines.yml, .vscode/launch-example.json]
---

# Interfaces (Phase E)

Repository location: `${AISDLC_REPO_PATIENT_BILLING_SCHEDULE}`. This repo exposes no REST routes, no GraphQL, no topics it consumes by API, and no server. Its single entry point is `lambda_handler(event, context)` in `main.py`. Event source wiring (API Gateway route, SQS event source mapping, EventBridge schedule) is not in the repo: `unknown`. Checked: all tracked files, no IaC, SAM, or serverless config.

## Inbound

### 1. Lambda handler `main.lambda_handler(event, context)`

Three accepted event shapes, evaluated in this order (`main.py:lambda_handler`):

| Shape | Detection | Parsed fields | Effect |
|---|---|---|---|
| API Gateway proxy style | `'body' in event` | `event = json.loads(event['body'])`, then `patient_id` (string, Mongo ObjectId hex) is read from the parsed body | Processes that one patient. `account` in a body is NOT read (observed: only `Records` path collects accounts) |
| SQS Records | `'Records' in event` | for each record `json.loads(record['body'])`; `account` (string account name) appended to accounts, `patient_id` appended to patient ids | `patient_id`s processed individually, `account`s processed as bulk (all eligible active patients of those accounts) |
| Direct invocation | neither of the above, `'patient_id' in event` | `event['patient_id']` | Processes that one patient. This is also the CLI/local form |

Detail: after the `Records` branch the code checks `'patient_id' in event.keys()` against the top-level event; a body-wrapped event is replaced by its parsed body first, so the check applies to the parsed body. An event with none of the keys does nothing and returns `None`. Malformed JSON in `body` or a record is caught by the outer `try` and only logged (`except Exception as e: log.info(e)`).

Authentication: none in code. API Gateway authorizer, resource policy, or Lambda IAM invoke permission: `unknown`. A `body` shape suggests an HTTP trigger (inferred), with no authorization visible here. Treat as open to whoever can invoke the function.

Request schema (observed, no validation library; no schema enforcement):

```
{ "patient_id": "<patient _id hex>" }                       # direct or API Gateway body
{ "Records": [ { "body": "{\"account\":\"<name>\"}" },      # SQS
               { "body": "{\"patient_id\":\"<id>\"}" } ] }
```

Behavior per patient (`calculate_billing`, `main.py:36-228` region): skip patients without `manufacturer` (`main.py:lambda_handler`), compute billing windows by billing code and schedule (`day_31`, `day_91`, first-time and recurring windows, LINQ, Cardio MEMS codes, constants in `src/utils/constants.py`), look up the best report, mark report billable, update schedule, create or archive follow-up tasks, update `next_send`/`late_date`, optionally queue a bot event. Each billing update is one Mongo transaction (`schedule.py:49-52`).

Bulk selection for `account` (`get_all_patients`, `src/database/query.py:87-160`): `active: True`, `doi` not null or empty, `serial_number` containing no lowercase letters, `account` in the list and not `"UCH"` (hard-coded exclusion), and any of: empty `billingHistory`, a schedule `cutoff_date` at or before today plus offset (`DAY_31_OFFSET` 4, `DAY_91_OFFSET` 7) or missing, `next_send` at or before today, `late_date` at or before today.

Response/return: the handler always returns `None` (no body, no status code). API Gateway Lambda proxy integration would reject a `None` return as a malformed response (inferred, 502); if the trigger is async or SQS the return value is ignored. Error behavior:

- Per-patient exceptions inside `calculate_billing` are caught, logged with traceback, and returned as the string `"<serial_number> <---> <error>"`; the handler collects these and sends one Slack message (see Outbound 4). The patient's Mongo transaction is aborted and the exception re-raised inside `update_billables`, so partial changes of that update are rolled back.
- Errors outside `calculate_billing` (event parsing, Mongo query) are caught by a handler-level `except` that only logs; no Slack, no Lambda failure, no SQS retry or DLQ. An SQS batch is therefore always treated as success (observed behavior; DLQ configuration `unknown`).
- Import-time failures (Secrets Manager fetch, Mongo `server_info()`) raise before the handler and fail the invocation.
- Record-level partial failures use no `batchItemFailures`.

Known consumers/callers: `unknown` (see dependencies.md edge 4). Known coupling note: `rest-api-evoke` documents calling other Lambdas through `AWS_LAMBDA_FUNCTION_NAME_*` names, none of which is a billing-schedule function by name; no confirmation.

Global state caveat: `PERSISTED_VALUES` (module global from `constants.py`) is mutated during a run (for example `bot_lambda_invoked`) and reset after each patient via `PERSISTED_VALUES.update(default_persisted_value)`; a `deepcopy` snapshot is taken at the handler start. The Mongo singleton and the cached `user_id` (`src/database/user.py`) survive warm invocations.

### 2. CLI (local)

`python main.py --patient <patient id>` (`required=True`, `argparse`). Calls `lambda_handler({'patient_id': <id>}, None)`. `context` is `None`, so a batch error would crash in `notify_in_slack` (`context.function_name`), observed. Needs a `.env` file (see dependencies.md). `.vscode/launch-example.json` shows the same invocation.

### 3. Scheduled interface

None in code. Whether an EventBridge schedule invokes the function: `unknown`.

### 4. File interfaces

None. `.env` is read only in local mode.

## Outbound

### 1. MongoDB writes (database interface)

Single database (name from secret key `DATABASE_NAME`). All writes go through `src/database/connection.py` (`update_one` with `$set` plus `$push` of an empty dict when none given, `update_many`, `insert_one`, `delete_one` defined but no caller found for `delete`).

| Collection | Operation | Written fields (summary) | Evidence |
|---|---|---|---|
| `patients` | `update_one` (no upsert) by `_id` | `next_send`, `late_date`, `implanted_billing_schedule.late`, `.billing_tasks.<call>.{trigger_date,triggered,task_id}`, `.<schedule>.{status,billing_code,suspend_date,cutoff_date,last_billing_date,last_report_date,estimated_*,active,updated_at,updated_by:"AWS LAMBDA BILLING",billing_tasks}`, `next_bill_date`, `explicit_next_bill_date`, and when no further reports: `active:false`, `deactivate_info{reason:"No Longer Monitoring"}` | `schedule.py:170-315, 365-375`, `query.py:289-298` |
| `reports` | `update_many` (set billable false by serial/device/code/date window where `evk_active` true and `last_billing_date` null); `update_one` (set billable true) | `billable`, `report_billing_date`, `moved_for_backbill`, `evk_active`, `evk_processed`, `evk_archived`, `clinic_for_review`, `updated_at`, `updated_by:"Evoke Automated Schedule Monitoring Lambda"` | `query.py:231-285` |
| `tasks` | `insert_one`; `update_one` archive | new task: `description` (patient name, dob, manufacturer, device, two phone numbers, physician, billing code; PHI/PII, see security note), `date`, `status:"To Do"`, `patient{_id,name,serial_number}`, `archived:false`, `created_by:"Automated Schedule Monitor Lambda"`, `created_at`, `account`, `automated_scheduling:true`; archive sets `archived:true`, `updated_at` | `query.py:311-361` |
| `billing_activity_logger` | upsert, `$push logs` | `document_id`, `collection`, `updated_at`, `logs[]` (events `next_send_update`, `billing_date_assigned`/`report_billed`, `bot_lambda_invoked`) | `src/events/billing_activity_logger.py`, `src/events/eventEmitter.py` |
| `user_activity_logs` | upsert, `$push logs` | filter `document_id` (ObjectId of report), `user_id` (the "EVOKE AUTOMATED NOTES" user `_id`), `module:"Transmission Report"`; log entry action "Billing Date Suggested" | `src/events/user_activity_log.py` |
| `manufacturer_crawler_report_status` | `update_one` with `upsert=False` | `action` "Bot Event Queued[, Next Send ...]", or failure record (see dependencies.md); with `upsert=False` and filter `{document_id}` or `{patient_id}` the update does nothing unless the document already exists (observed code; creation elsewhere `unknown`) | `query.py:301-309`, `schedule.py:340-362` |

Reads: `patients`, `reports`, `accounts`, `devices`, `device_types`, `users` (see dependencies.md).

The internal event emitter (`src/events/eventEmitter.py`) is in-process and synchronous; it is not an external interface. Events: `next_send_update`, `billing_date_assigned`, `bot_lambda_invoked`.

### 2. Amazon SQS send (manufacturer bot)

- Queue: URL from secret key `MANUFACTURER_BOT_SQS_URL` (optional; no send when absent). FIFO handling: when the URL ends with `.fifo`, `MessageGroupId` = patient id, `MessageDeduplicationId` = random uuid hex (so no actual deduplication).
- Body: `{"eventType":"BOT_EVENT_TRIGGER","value":"<patient _id>"}`.
- Trigger: after a committed transaction, when `late_date` exists, no bot event was already sent in this run (`PERSISTED_VALUES['bot_lambda_invoked']`), `next_send` has been reached, and the device type is not in `MANUFACTURERS_BLOCKED_FOR_NEXT_SEND_UPDATE` for the manufacturer when no report was found (`schedule.py:35-150, 376-435`; `constants.py:209`).
- Error behavior: send failure (`ClientError`, `BotoCoreError`, `ConnectionError`, `TimeoutError`, `ValueError`) is logged; a failure record is written to `manufacturer_crawler_report_status` (update-only, see above); no retry; processing continues.
- Consumer: manufacturer crawler bot, same payload family as `rest-api-evoke` (`BOT_EVENT_TRIGGER`). Consumer repo `unknown`, not registered.

### 3. AWS Secrets Manager read

`GetSecretValue(SecretId=$SM_NAME)` in region `$SM_REGION` at import time. JSON keys read: `DB_URI`, `DATABASE_NAME`, `SLACK_URL`, `EVOKE_SLACK_URL`, `MANUFACTURER_BOT_SQS_URL`. Values never recorded. Missing `SM_REGION`/`SM_NAME` raises `KeyError` at import when no `.env`.

### 4. Slack webhook (third-party integration)

`POST` (body is a JSON string, no explicit `Content-Type` header; Slack accepts it) to the URL in `LF_SLACK_URL` (secret key `SLACK_URL`). Message: bold "An Error Occured in <function name>", a code block of the aggregated per-patient error lines (`<serial> <---> <error>`), and a CloudWatch log-stream link built from `invoked_function_arn`, `log_group_name`, `log_stream_name`. Sent only when the batch had at least one per-patient error. No timeout is set on the request, failures are not handled (an exception here is caught by the handler-level `except` and only logged). `notify_in_slack` supports `is_error=False` but no caller uses it (grep). Error text may include patient serial numbers (identifiers in a team Slack channel; sensitivity `unknown`).

### 5. CI/CD interface (Bitbucket Pipelines)

Branch push to `lf-qa`, `lf-uat`, or `main` publishes the Lambda code (see dependencies.md). No pull-request or test pipeline. Production deploy is automatic on `main` push (`bitbucket-pipelines.yml`), which the workspace safety rules treat as a production-write path; the aisdlc workflow must not trigger it.

## Cross-repository interface notes

| Interface | Counterpart | Status |
|---|---|---|
| Mongo collections `patients`, `reports`, `tasks`, `accounts`, `users`, `devices`, `device_types`, `user_activity_logs` | `rest-api-evoke` (shared data model) | inferred (names match, DB identity unverified) |
| SQS `BOT_EVENT_TRIGGER` `{eventType, value}` | same payload as `rest-api-evoke` -> bot queue | observed payload, inferred shared queue |
| `reports` (written by HL7 parser, read here) | `manufacturer-hl7-parser` | inferred (data only) |
| Inbound `patient_id` / `account` events | producer `unknown` | unknown |
| `users` name "EVOKE AUTOMATED NOTES" | `rest-api-evoke` `EVOKE_AUTOMATED_NOTES_USER` default | observed (name equality) |
| `evoke-portal-front-end` | no code evidence | unknown |

## Unknowns

API Gateway/EventBridge/SQS wiring and authorizers, DLQ and batch size, queue name values, Lambda timeout/memory/concurrency (concurrent invocations for the same patient could race; transactions only guard individual writes), whether the SQS `account` messages are produced by `rest-api-evoke` or a scheduler, `.env-example` key list. Checked: `main.py`, `src/**`, pipeline, launch example.
