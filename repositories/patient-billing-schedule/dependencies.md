---
repository: patient-billing-schedule
analyzed_commit: dea0eff5ed6fd7d5a9ee734cd132862a27a4fb31
analyzed_branch: main
analyzed_at: 2026-10-15T08:45:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [requirements.txt, requirements-dev.txt, tests/conftest.py, tests/*.py, main.py, bitbucket-pipelines.yml, .gitignore, .env-example, .vscode/launch-example.json, src/config.py, src/database/connection.py, src/database/query.py, src/database/schedule.py, src/database/user.py, src/events/eventEmitter.py, src/events/billing_activity_logger.py, src/events/user_activity_log.py, src/utils/aws.py, src/utils/slack.py, src/utils/constants.py, src/utils/activityLogger.py]
---

# Dependencies (Phase D)

Repository location: `${AISDLC_REPO_PATIENT_BILLING_SCHEDULE}`. Remote name is `patient-schedule-monitoring`; Lambda artifacts are named `*-patient-bill-schedule.zip`. A Python AWS Lambda, no web framework, 34 tracked files (6 test modules under `tests/` since EL-5610).

## Packages (`requirements.txt`, exact pins; observed)

The file is encoded UTF-16 (BOM present); a tool that reads it as UTF-8 sees NUL-separated characters. `pip install -r` handles UTF-16 with BOM in recent pip versions (not verified here).

| Package | Pin | Class | Use / evidence |
|---|---|---|---|
| `pymongo` | 4.6.3 | direct | MongoDB driver, `src/database/connection.py:1`, sessions/transactions in `src/database/schedule.py:49-52` |
| `boto3` | 1.34.88 | direct | Secrets Manager (`src/config.py:4,24`) and SQS (`src/utils/aws.py:3,19`). Also pre-provided by the Lambda Python runtime; the pin is bundled in the zip |
| `botocore` | 1.34.88 | indirect (also imported directly) | `from botocore.exceptions import BotoCoreError, ClientError`, `src/database/schedule.py:4` |
| `requests` | 2.31.0 | direct | Slack webhook POST, `src/utils/slack.py:3,16` |
| `python-dateutil` | 2.9.0.post0 | direct | `dateutil.parser.parse`, `src/utils/date.py:4` |
| `bson` (`ObjectId`) | from `pymongo` | indirect | `from bson.objectid import ObjectId`, `src/database/query.py:3`; no separate `bson` pin |
| `mongoengine` | 0.28.2 | unused (inferred) | pinned but no `import mongoengine` in tracked `*.py` (grep found none). Candidate for removal; unverified at runtime |
| `certifi`, `charset-normalizer`, `idna`, `urllib3` 2.2.1, `jmespath`, `s3transfer`, `six`, `dnspython` 2.6.1 | pinned | indirect | transitive of requests, boto3, pymongo |

`requirements.txt` is unchanged since the previous analyzed commit (it is not in the changed-file list; the requested `git diff ec1d889..origin/main` could not be run because the repository path variable was not resolvable in the analyst shell, so this is established from the changed-file list and a re-read of the snapshot, observed).

### Dev dependencies (`requirements-dev.txt`, new, ASCII with CRLF; observed)

| Package | Pin | Class | Use / evidence |
|---|---|---|---|
| `pytest` | 9.1.1 | test-only | test runner, `tests/*.py` (45 `def test` occurrences) |
| `mongomock` | 4.3.0 | test-only | in-memory MongoDB replacing `pymongo.MongoClient` in `tests/conftest.py` (spies wrap `Collection.delete_many` / `update_many` because mongomock rejects real sessions) |
| `pymongo`, `boto3`, `botocore`, `python-dateutil`, `requests` | same pins as `requirements.txt` (4.6.3, 1.34.88, 1.34.88, 2.9.0.post0, 2.31.0) | test-only (duplicate of the runtime pins) | mirror of the runtime packages; `mongoengine`, `certifi`, `urllib3` etc. are not repeated |

Tests need no network, database, or secrets: `tests/conftest.py` stubs `src.config` with synthetic dummy values (names `DB_URI`, `DATABASE_NAME`, `LF_SLACK_URL`, `EVOKE_SLACK_URL`, `MANUFACTURER_BOT_SQS_URL`) and monkeypatches `src.utils.aws.send_sqs_message` and `src.utils.slack.notify_in_slack`. Class `build-only`: none in Python; CI uses `zip` and `aws` CLI from the pipeline image only. CI does not run `pip install` or `pytest` (grep of `bitbucket-pipelines.yml`: no `pip`, `pytest`, or test step), so the tests run only locally (inferred).

## Runtime and build

- Python version: unknown. Checked: no `runtime.txt`, `.python-version`, `pyproject.toml`, `setup.py`, Dockerfile, or SAM/Terraform template in the tracked files. The Lambda runtime is configured outside this repo.
- Lambda handler entry: `main.lambda_handler` (inferred from function name and layout; the Lambda configuration is not in the repo).
- Packaging (`bitbucket-pipelines.yml`): the pipeline does not run `pip install`. It zips the repository root as-is (after removing `.gitignore`, `bitbucket-pipelines.yml`, `.git`; `tests/` and `requirements-dev.txt` are therefore included in the artifact, observed) and uploads it to S3, then `aws lambda update-function-code --publish`. Third-party packages from `requirements.txt` are therefore not bundled by this pipeline; they must come from a Lambda layer or the runtime (`boto3`/`botocore`), which is `unknown`. Checked: pipeline script, `.gitignore`.
- Branch to environment mapping: `lf-qa` -> QA zip `qa-patient-bill-schedule.zip`, `lf-uat` -> UAT zip, `main` -> PROD zip `prod-patient-bill-schedule.zip`. Pipeline image `public.ecr.aws/c7j4d3u2/build-agent-image:latest` (unpinned tag). AWS auth by Bitbucket OIDC web identity token (`oidc: true`).
- Pipeline variable names (values not read): `AWS_REGION`, `AWS_ROLE_ARN`, `DEV_LAMBDA_RESOURCE_BUCKET`, `PROD_LAMBDA_RESOURCE_BUCKET`, `QA_LAMBDA_NAME`, `UAT_LAMBDA_NAME`, `PROD_LAMBDA_NAME`.
- Local run: `python main.py --patient <patientId>` with a `.env` file (`.env-example`, `.vscode/launch-example.json`). `.env` is parsed as `KEY=value` lines split on `=` (a value containing `=` would break the loader, `src/config.py:15-17`). `.env-example` could not be read by the analyst tooling (access denied), its keys are `unknown` beyond what `src/config.py` consumes.

## Configuration sources (names only)

Two modes decided at import time in `src/config.py`:

1. Local: a `.env` file in the working directory, every `KEY=value` line copied into `ENV_VARS`.
2. Deployed (no `.env`, `FileNotFoundError`): env vars `SM_REGION` and `SM_NAME` locate an AWS Secrets Manager secret (JSON). Keys read from the secret: `DB_URI`, `DATABASE_NAME`, `SLACK_URL` (stored as `ENV_VARS.LF_SLACK_URL`, comment "FOR DEVELOPMENT TEAM"), `EVOKE_SLACK_URL` (optional, loaded, no use found: `unknown`), `MANUFACTURER_BOT_SQS_URL` (optional; when absent no bot event is queued or sent and the patient is not marked as bot-invoked, `src/database/schedule.py:queue_bot_event`, `flush_bot_events`).

In local mode `DB_URI`, `DATABASE_NAME`, `LF_SLACK_URL`, `MANUFACTURER_BOT_SQS_URL` are expected to come from `.env` under those names (inferred from usage as `ENV_VARS.<name>`; the local `.env` key spelling for Slack is `LF_SLACK_URL`, not `SLACK_URL`, so a local-to-deployed naming mismatch exists, observed). No secret values recorded.

AWS credentials and region for the SQS client come from the Lambda execution role / default boto3 chain (`boto3.client('sqs')` without region or keys, `src/utils/aws.py:19`); the queue URL region is therefore resolved from the ambient environment (`unknown`).

## AWS services

| Service | Use | Config names | Evidence |
|---|---|---|---|
| Lambda (hosting) | Runtime of this code; invoked by API Gateway or SQS event source (see interfaces.md); `context.function_name`, `log_stream_name`, `log_group_name`, `invoked_function_arn` used in Slack message | n/a | `main.py:lambda_handler`, `src/utils/slack.py` |
| Secrets Manager | `GetSecretValue` for config at cold start | `SM_REGION`, `SM_NAME` | `src/config.py:20-35` |
| SQS | `SendMessage` to the manufacturer bot queue; FIFO-aware (`.fifo` suffix adds `MessageGroupId`, now an explicit argument, and a random `MessageDeduplicationId`). Events are queued in-process and sent once per run by `flush_bot_events()`, batched (see interfaces.md Outbound 2). Send only; the SQS inbound trigger is a Lambda event source (consumed through the handler, not through the SQS API) | `MANUFACTURER_BOT_SQS_URL` | `src/utils/aws.py`, `src/database/schedule.py:queue_bot_event, flush_bot_events` |
| S3 (CI only) | Lambda code zip staging | `DEV_LAMBDA_RESOURCE_BUCKET`, `PROD_LAMBDA_RESOURCE_BUCKET` | `bitbucket-pipelines.yml` |
| CloudWatch Logs | Link built to the log stream in Slack messages (console URL only, no API call) | n/a | `src/utils/slack.py:create_url` |
| API Gateway (inferred) | Handler unwraps `event['body']` | n/a | `main.py:lambda_handler`; gateway config not in repo: `unknown` |

## Third-party HTTP APIs

| Service | Use | Evidence |
|---|---|---|
| Slack incoming webhook | `POST` JSON `{text}` to `ENV_VARS.LF_SLACK_URL` on batch errors; response printed (the webhook URL is secret, not recorded) | `src/utils/slack.py:8-17` |

No billing system (Benchmark), Twilio, or other HTTP API is called from this repo (grep of imports: only `requests` in `slack.py`).

## Databases

MongoDB only. `pymongo.MongoClient(DB_URI)`, database name from `DATABASE_NAME`, `server_info()` connectivity check at import time (`src/database/connection.py:14-20`). The module-level singleton `Mongo = MongoConnection()` opens the connection on import; a failure raises before the handler runs. Multi-document transactions (`session.start_transaction()`) are used per billing update, which requires a replica set or sharded cluster (inferred, topology `unknown`). The singleton is reused across warm invocations; `disconnect()` is never called by the handler (grep).

Collections touched (names from `src/utils/constants.py:4-24`, usage verified in `src/database/*.py`, `src/events/*.py`):

| Collection | Access | Fields used |
|---|---|---|
| `patients` | read, update (no upsert, `upsert=False`) | read: `information.in_office_only` (new, skips the bot event), `dob, doi, name, device, active, account, next_send, late_date, created_at, information, manufacturer, serial_number, billingHistory, last_bill_date, next_send_cycle, deviceInformation.modelName/modelNumber, implanted_billing_schedule`; write: `next_send, late_date, next_bill_date, explicit_next_bill_date, active, deactivate_info, implanted_billing_schedule.*` |
| `reports` | read, update | read by `patient_serial_num, device, billing_code, report_date, last_billing_date, evk_active, signed_at`; write `billable, report_billing_date, evk_active, evk_processed, evk_archived, clinic_for_review, updated_at, updated_by, moved_for_backbill` |
| `live_call_tasks` (new) | read, update (by `_id` list) | read `patient_id, status` (filter `status != "archived"`); write `status: "archived"` when a patient is deactivated (730 days without transmission, `DAYS_OFFSET_TO_SET_PATIENT_INACTIVE`). The commit subject says "delete" but the code archives (no delete caller in `src/`) | `src/database/query.py:archive_live_call_tasks_by_patient_id`, `src/database/schedule.py:archive_live_call_tasks` |
| `manufacturer_accounts` (new) | read | filter `isActive: true` and `{manufacturer, account}` pairs; projection `manufacturer, account`. Gates which groups get a bot event | `src/database/query.py:get_active_manufacturer_accounts` |
| `tasks` | insert, update | insert follow-up task (`created_by` "Automated Schedule Monitor Lambda", `automated_scheduling: true`); archive via `archived: true` |
| `accounts` | read (aggregation by `name`) | `settings.manufacturer.<name>.initial_report_tab.{hf,regular}`, `settings.billing.next_process_anchor` |
| `devices` + `device_types` | read ($lookup) | `modelName, summary_report, deviceTypeId`, `device_types.shortName` |
| `users` | read | document with `name == "EVOKE AUTOMATED NOTES"` (`_id` used as actor) |
| `billing_activity_logger` | upsert, push to `logs` | `document_id, collection, updated_at, logs[]`; new event `live_call_tasks_archived` also writes here (action "Live Call Tasks Archived", `archived_count`, `archived_tasks[]`, `reason`) |
| `user_activity_logs` | upsert, push to `logs` | `document_id, user_id, module "Transmission Report", logs[]` (billing date suggested); new: module `"Live Call Task"` with `document_id` = patient id and "Archive Live Call Task" entries pushed with `$each`, `created_at` set on insert (`src/events/billing_activity_logger.py:live_call_tasks_archived`) |
| `manufacturer_crawler_report_status` | update only (`upsert=False`; update of a non-existent document is a no-op) | `action`, or failure/skip record `patient_id, name, manufacturer, account, next_send, status ("Fail" or new "Skipped"), error, event_type, created_at` |

Constants defined but with no access found: `report_cover_pages`, `hl7jobs`, `adts`, `acks` (`constants.py:4-11`). Connection helpers `delete` and the new `delete_many` (non-empty filter required) have no caller in `src/` (grep; `delete_many` is exercised only by `tests/test_connection_delete_many.py`).

## Code-level references to other registered repositories (candidate edges)

| # | Edge | Direction | Evidence | Status |
|---|---|---|---|---|
| 1 | `patient-billing-schedule` <-> `rest-api-evoke` via shared MongoDB database and collections `patients`, `reports`, `tasks`, `accounts`, `users`, `devices`, `device_types`, `user_activity_logs`; collection names equal the model collections that `rest-api-evoke` reads and writes (see its `dependencies.md` edge 1 and `interfaces.md`). Both write `patients.implanted_billing_schedule`, `next_send`, `late_date` (this Lambda sets `updated_by` "AWS LAMBDA BILLING"). Whether both use the same database name: `unknown` (names are in secrets) | read-write both ways | `src/utils/constants.py:4-24`, `src/database/query.py`, `src/database/schedule.py` | inferred (collection names match, database identity unverified) |
| 2 | Same actor identity: the Lambda reads the `users` document named "EVOKE AUTOMATED NOTES" for its audit trail; `rest-api-evoke` uses the same default via env `EVOKE_AUTOMATED_NOTES_USER` (default "EVOKE AUTOMATED NOTES") | shared data | `src/database/user.py:4-22`; rest-api-evoke `dependencies.md` edge 11 | observed (name equality on both sides) |
| 3 | This Lambda -> manufacturer crawler bot SQS consumer. CHANGED at dea0eff (EL-5444): a single-patient group still sends `{eventType:"BOT_EVENT_TRIGGER", value:<patientId>, source:"PATIENT SCHEDULE MONITORING"}` (previous shape plus `source`); a multi-patient group now sends a NEW type `{eventType:"BOT_EVENTS_TRIGGER", manufacturer, account, patient_ids:[<=70], source}`. `rest-api-evoke` sends the single-patient shape (without `source`, as far as its docs say) to `AWS_BOT_QUEUE_URL` (its `dependencies.md` edge 9). Same queue is likely (`MANUFACTURER_BOT_SQS_URL` vs `AWS_BOT_QUEUE_URL`; URL values not read: `unknown`). Consumer repository: not registered, `unknown`; whether the consumer already handles `BOT_EVENTS_TRIGGER` and `source`: `unknown` | producer | `src/database/schedule.py:flush_bot_events`, `src/utils/constants.py:229-232`, `src/utils/aws.py` | observed (payload), inferred (same queue) |
| 3a | New data dependence: the Lambda reads `manufacturer_accounts` (`isActive`, `manufacturer`, `account`) before sending. Writer/owner not evidenced here (no write in this repo); candidates `rest-api-evoke` or the bot service | shared data | `src/database/query.py:get_active_manufacturer_accounts` | unknown (owner) |
| 3b | New: `live_call_tasks` documents are set to status `archived` on patient deactivation. Owner likely `rest-api-evoke` / front end (live call task feature), not evidenced here | shared data | `src/database/query.py:archive_live_call_tasks_by_patient_id` | inferred |
| 4 | Producer of this Lambda's inputs (messages with `account` or `patient_id`, or API Gateway body): `unknown`. Possible: `rest-api-evoke` (it invokes other Lambdas via `services/lambda.js` but no function name or payload for billing schedule appears in its documented env names), a scheduler (EventBridge), or a manual caller. Checked: this repo has no event source mapping or IaC | inbound | `main.py:lambda_handler` | unknown |
| 5 | `manufacturer-hl7-parser`: no code reference. The parser inserts `reports` and `patients` (parser `data-model.md`), which this Lambda consumes (reports by `patient_serial_num`, `device`, `billing_code`, `report_date`). That is a data-level dependence through MongoDB only; no queue, URL, or import shared | data producer | `src/database/query.py:162-218`; sibling docs | inferred |
| 6 | `evoke-portal-front-end`: no reference. Front end likely displays `implanted_billing_schedule`, `tasks` (via the API); not evidenced here | none | grep of repo found no URL/origin | unknown |

## Unknowns

Python runtime version, how dependencies are packaged (layer or otherwise), event sources (SQS queue names, API Gateway route, schedule), IAM permissions, Mongo topology, queue and bucket values, whether `EVOKE_SLACK_URL` is used, contents of `.env-example`. Whether the bot consumer supports `BOT_EVENTS_TRIGGER`/`source`, owners of `manufacturer_accounts` and `live_call_tasks`, whether tests run in any CI. Checked: all 34 tracked files, `requirements.txt`, `requirements-dev.txt`, pipeline, config loader.
