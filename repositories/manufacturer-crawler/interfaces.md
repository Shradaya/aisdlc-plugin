---
repository: manufacturer-crawler
analyzed_commit: d6aa388a03c12e777846a704818ba5903a021a4f
analyzed_branch: main
analyzed_at: 2026-10-15T08:55:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [main.py, eventHandler/event_schema.py, eventHandler/bot_trigger.py, eventHandler/bot_triggers.py, eventHandler/recrawl.py, eventHandler/test_report.py, eventHandler/disconnected_monitors.py, eventHandler/cron_job.py, utils/response.py, utils/config.py, utils/exportToS3.py, utils/slack.py, utils/accounts.py, database/export.py, database/insertDocument.py, database/updateDocument.py, constants.py, README.md, bitbucket-pipelines.yml]
---

# Interfaces (Phase E)

Repository location: `${AISDLC_REPOS_ROOT}/manufacturer-crawler`. No REST routes, no GraphQL, no server. One entry point: `main.lambda_handler(event, context)` (container CMD `main.lambda_handler`). Trigger wiring (SQS event source mapping, EventBridge rules, function URLs, IAM invoke permissions) is not in the repo: `unknown` (checked the full file tree; no IaC). Authentication: none in code; access is whoever may send to the queue or invoke the function (`unknown`).

## Inbound: Lambda handler

Dispatch (`main.py:run_lambda_handler`):

- If the event is a dict containing `Records`: SQS mode. Each record `body` is `json.loads`-ed; if parsing fails the raw string is used as payload. Records are processed sequentially with one shared headless Chrome (cookies cleared between records; the browser is recreated if cookies cannot be cleared).
- Otherwise: single event (direct invoke, EventBridge, local). The event itself is the payload and `process_event` returns its ack to the caller.

Validation (`eventHandler/event_schema.py:validate_event_payload`): payload must be a dict; `eventType` must be one of the six names; a pydantic model (`extra="allow"`, so unknown fields are accepted and preserved; returned dict is `model_dump(exclude_none=True)`). Validation error behavior (`main.py:process_event`): a `ValueError` posts `<!here> Invalid event payload received` to Slack (error webhook) and returns `(None, driver)`. In SQS mode this is NOT a failure: the record is silently acked (no batchItemFailures entry, no retry, no DLQ). A non-JSON SQS body is also treated this way (validation error "event payload must be a JSON object").

### Event schemas

All events require `eventType` (string, one of the values below).

| eventType | Required | Optional | Validation rules | Extra fields |
|---|---|---|---|---|
| `BOT_EVENT_TRIGGER` | `value` (str, patient `_id` hex) | `manufacturer`, `account`, anything | `value` non-empty after strip. Not validated as ObjectId by pydantic; `ObjectId(value)` is called in the handler (invalid id raises `bson.errors.InvalidId`) | allowed, ignored |
| `BOT_EVENTS_TRIGGER` | `manufacturer` (str), `account` (str), `patient_ids` (list[str]) | anything | manufacturer in {`Medtronic`, `Boston Scientific`, `Biotronik`, `Abbott`} (exact case); account non-empty; `patient_ids` non-empty list, each a non-empty string. No maximum size and no uniqueness check | allowed, ignored |
| `RECRAWL` | `manufacturer` (valid as above) | `value` (list[str] patient ids) | `value`, when present, must be a non-empty list of non-empty strings. When `value` is omitted the handler selects work from `manufacturer_crawler_report_status` and `manufacturer_crawler_account_status` (max 100 recent-failure patients, total cap `TOTAL_RECRAWLED_PATIENTS` = 200) | allowed, ignored |
| `TEST_REPORT` | `value` (list[str] report `_id`s) | anything | non-empty list of non-empty strings. Fetches `reports` by `_id` and crawls them | allowed, ignored |
| `CRON_JOB` | `manufacturer` (valid) | `account` (str) | Selects `reports` of the last `TIME_PERIOD` (24 h) for Medtronic, Boston Scientific, Abbott (aggregation with `$lookup` to `patients` and `manufacturer_crawler_report_status`), or due Biotronik patients by account local timezone | allowed, ignored |
| `GET_DISCONNECTED_MONITORS` | `manufacturer` (valid) and, unless `includeAllAccounts` is true, `account` (non-empty) | `includeAllAccounts` (bool, default false), `account_type` (`NXT` or `CLARITY`, case-insensitive, normalised to upper case) | model validator: account required when `includeAllAccounts` is false | allowed, ignored |

The field `source` is not declared in any model and is never read anywhere in the code (grep of `*.py`: no match); it passes validation as an extra field.

### Return values and errors by event type

`process_event` return, per path:

- `BOT_EVENT_TRIGGER` and `BOT_EVENTS_TRIGGER`: returns an ack `{"status": 200|202, "message": str}` (`utils/response.py`: `setSuccess` is 200, `setError` is 202) and posts `RESPONSE: <ack>` to Slack. Specifics: patient not found or `information.in_office_only` true gives `None` ack and no crawl (single event); inactive account gives 202 `The account <a> of <m> is inactive.`; Biotronik patient not due today gives 200 `Document will be exported at <date>` (single event) or 200 `No patients are due to be exported.` (batch). If `SECRET` could not be loaded the ack is 202 `Unable to load secrets...`. No documents found gives 202 `No documents found.`.
- `RECRAWL`, `TEST_REPORT`, `CRON_JOB`: return `None` on completion. Slack messages carry the progress.
- `GET_DISCONNECTED_MONITORS`: returns the handler result directly. With a single account it is the manufacturer module response (`{"hasError": bool, "data": ..., "latitude_nxt"/"latitude_clarity": ..., "hasNxtError"/"hasClarityError"...}`; exact shape per manufacturer module: not fully catalogued, `unknown`); on exception `{"hasError": true, "message": "Something went wrong.", "data": "Error: <str>"}`; inactive account returns the 202 ack; with `includeAllAccounts` returns `{"message": "Execution completed!"}`. This is the synchronous invoke contract used by rest-api-evoke (receiver side only verified).

SQS semantics (`main.py:97-135`): a record that raises is added to `batchItemFailures` (`{"itemIdentifier": messageId}`); the handler returns `{"batchItemFailures": [...]}`. If every record failed, the handler raises `Exception("All N SQS records failed...")` so the whole batch is retried. Therefore partial-batch response requires `ReportBatchItemFailures` on the event source mapping (`unknown`, not in repo). Errors that do raise: `InvalidId` for a malformed patient id, `KeyError` when `active_accounts[manufacturer]` is missing in the single-event handler (a manufacturer with zero active accounts is dropped from the dict by `activeAccounts`), driver creation failure, GET_DISCONNECTED_MONITORS "reprocess" cases (`Error: Message:` or `no such window` in the failure reason, only when `Records` present, which deliberately raises so the record is retried). Handled and acked without retry: validation failure, inactive account, patient not found, crawl failures (logged to Slack and to `manufacturer_crawler_report_status`).

Ordering/FIFO: no message group id handling, no deduplication, no ordering assumptions in code (grep `FIFO|MessageGroup`: none). Processing is idempotent-ish: `manufacturer_crawler_report_status` is upserted by `patient_id` (replace). Concurrency: one Chrome per invocation (`--single-process`); concurrency limits `unknown`. BOT_EVENT_TRIGGER for one patient breaks out of the credential loop after the first 200 ack.

Duration: SQS batch records are processed serially in one invocation; Lambda timeout and queue visibility timeout are not in repo, so large batches may time out (`unknown`).

## Sender compatibility (receiver side only; sender code not read here)

| Sender field set | Accepted by `event_schema.py`? | Notes |
|---|---|---|
| patient-billing-schedule `BOT_EVENT_TRIGGER {eventType, value=<patient id>, source}` | Yes | `source` is an extra field, allowed and ignored. `eventType` must be present in the body (verify in sender). Body must be JSON (SQS) or a dict (direct) |
| patient-billing-schedule `BOT_EVENTS_TRIGGER {eventType, manufacturer, account, patient_ids (<=70), source}` | Yes, provided `manufacturer` is exactly one of the four strings and `account` equals the stored `manufacturer_accounts.account` of an active account | No maximum list size (70 is a sender-side choice; no upper bound here). Empty list rejected (Slack alert, acked, dropped). All ids must be valid 24-hex ObjectId strings or the whole record fails and is retried. Patients are filtered to `manufacturer` and `account` matching the event; non-matching ids are silently skipped |
| rest-api-evoke `BOT_EVENT_TRIGGER {value, ...}` | Yes if `value` is a non-empty string | Receiving side accepts any additional fields |
| rest-api-evoke synchronous invoke `GET_DISCONNECTED_MONITORS` | Yes if `manufacturer` valid and (`account` present or `includeAllAccounts` true); `account_type`, if sent, must be NXT or CLARITY | Return value is the module response dict, the invoker must tolerate `hasError: true` bodies |

Value-vs-type watch: `value` and `patient_ids` must be strings; ObjectId or number types are rejected by pydantic (strict `str` fields in pydantic v2 do not coerce ints). Required `manufacturer` casing (`Boston Scientific` with a space) is a likely cross-repo mismatch point.

## Outbound writes

MongoDB (database name from the secret; see dependencies.md for collection sharing):

| Collection | Operation | Key | Written fields | Evidence |
|---|---|---|---|---|
| `manufacturer_crawler_report_status` | bulk `ReplaceOne` upsert, filter `{patient_id}` | per patient | `patient_id` (str), `name`, `manufacturer`, `account`, `next_send{preceding_next_send, current_next_send}`, `status` (Success, Fail, Not Found, In Progress, Already Exported, Already Scheduled, Already Transferred), `error{hasError, reason}`, `event_type`, `created_at` | database/export.py, insertDocument.py |
| `manufacturer_crawler_account_status` | `ReplaceOne` upsert, filter `{manufacturer, account}` | per account | `crawl_status{status, crawled_upto, password_expired, password_expired_at}` | recrawl.py:checkAccountToBeRecrawled, Abbott/Boston/Medtronic crawlers |
| `manufacturer_accounts` | `update_one` | `{manufacturer, account, username}` | `isActive=false`, `schedule=false`, `haltInfo` on expired portal password | utils/accounts.py |
| `reports` | `update_many` by `_id` list | report ids (plus HF reports) | `transmission_alert_information{alert_priority, alert_description}` | database/updateDocument.py, trackAlert.py |
| `biotronik_exported_reports` | `ReplaceOne` upsert | `_id` = patient id | `name`, `account`, `serial_number`, `exported_at` | biotronik.py:371 |
| `noshow_disconnected_logs` | `replace_one` upsert, filter `{manufacturer, account, status[, account_type]}` | per account and status | `manufacturer`, `account`, `updated_at`, `s3_key`, `status` (Success or Fail), `event` (full event), `failed_reason` (includes the public IP), optional `account_type` | disconnected_monitors.py |

S3 (bucket env `PROCESSED_BUCKET`):

- Disconnected monitors JSON: key `{S3_NOSHOW_KEY_PREFIX}/{Manufacturer_with_underscores}/{account_type_lower/}{YYYY-MM-DD}/{account_abbr}_{YYYY-MM-DD_HH-MM-SS}.json`, content type `application/json`, body is the module response plus `manufacturer` and `account`.
- Failure screenshots: `manufacturer-bot-crawler/screenshots/{YYYY/MM/DD}/snapshot_{YYYYMMDDTHHMMSSZ}.png` (uploaded from `/tmp/snapshot.png` on exception-with-snapshot Slack formats). The key is computed once at import time, so warm invocations reuse the same date and timestamp (observed: `utils/config.py` module scope), which overwrites earlier snapshots.

Slack: incoming-webhook POST (`requests.post` with JSON `{"text": ...}`). Channels by secret key: `SLACK_URL` (progress), `SLACK_URL_NOSHOW` (used for GET_DISCONNECTED_MONITORS runs, switched by `update_config` per event), `ERROR_SLACK_URL` (errors; falls back to `SLACK_URL`), `SLACK_URL_PASSWORD_EXPIRED` (password expiry); env `SLACK_URL` overrides the default. Snapshot upload via `slack_sdk.WebClient.files_upload_v2` using `EVOKE_ALERT_TOKEN` and `BOT_CHANNEL_ID`. Messages include patient or account identifiers and, for invalid payloads, the validation error text (PHI exposure level in Slack not assessed: `unknown`). No secret values are recorded here.

Manufacturer portals (outbound browser sessions) are written to as well: the crawler sets "next send" schedules and exports reports in the portals (Biotronik create-report), which is the core side effect; the portal changes are not mirrored into `patients` by this repo.

## Other interfaces

- Scheduled: `CRON_JOB` per manufacturer (and likely other events) from EventBridge on a second Lambda deployed from the same image (`EVENTBRIDGE_BOT_LAMBDA`); schedules `unknown`.
- CLI: none. Local run via `LOCAL_EXECUTION` plus `CHROME_BINARY_LOCATION_PATH` and `SELENIUM_SERVICE_EXECUTABLE_PATH`, invoking `lambda_handler` manually (no `__main__` entry found in `main.py`). README documents manual Lambda test events for `bot_lambda` with BOT_EVENT_TRIGGER, BOT_EVENTS_TRIGGER and GET_DISCONNECTED_MONITORS only.
- Known consumers/callers: patient-billing-schedule and rest-api-evoke per the caller's brief (not verifiable from this repo); EventBridge for CRON_JOB (inferred).
