---
repository: patient-billing-schedule
analyzed_commit: dea0eff5ed6fd7d5a9ee734cd132862a27a4fb31
analyzed_branch: main
analyzed_at: 2026-10-15T08:45:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [main.py, src/config.py, src/database/connection.py, src/database/query.py, src/database/schedule.py, src/database/inputParams.py, src/database/user.py, src/events/eventEmitter.py, src/events/billing_activity_logger.py, src/events/user_activity_log.py, src/utils/activityLogger.py, src/utils/aws.py, src/utils/slack.py, src/utils/constants.py, src/utils/date.py, src/utils/utils.py, src/utils/format.py, src/utils/logger.py, bitbucket-pipelines.yml, requirements.txt, requirements-dev.txt, tests/conftest.py, tests/test_billing_activity_logger.py, tests/test_connection_delete_many.py, tests/test_query_live_call_tasks.py, tests/test_schedule_deactivation_cleanup.py, tests/test_user.py]
---

# Structure (Phase B)

34 files at the snapshot (was 27; no `.git`, so counts are from a directory listing): 28 `.py` files (22 in `main.py` plus `src/`, 6 under `tests/`), `requirements.txt`, new `requirements-dev.txt`, `bitbucket-pipelines.yml`, `.env-example`, `.gitignore`, `.vscode/launch-example.json`. Added since the last analysis: `requirements-dev.txt` and `tests/` (`conftest.py` plus 5 `test_*.py`). `main.py` plus `src/` are 22 `.py` files, 2,163 lines.

## Top level

| Path | Role |
|---|---|
| `main.py` | Lambda handler `lambda_handler`, per-patient orchestration `calculate_billing`, window calculation `calculate_billing_period`, CLI entry |
| `src/config.py` | Loads `ENV_VARS`: local `.env` file if present, otherwise AWS Secrets Manager |
| `src/database/connection.py` | Singleton pymongo wrapper `Mongo` (find, find_one, upsert (now with optional `set_on_insert`), insert, updateMany, delete, new `delete_many` (rejects an empty filter with `ValueError`, passes `session`, returns the deleted count), run_aggregation); optional transaction `session` |
| `src/database/query.py` | All query and write functions against `patients`, `reports`, `devices`, `accounts`, `tasks`, `manufacturer_crawler_report_status`; `retry_on_write_conflict` decorator; new `archive_live_call_tasks_by_patient_id` (`live_call_tasks`) and `get_active_manufacturer_accounts` (`manufacturer_accounts`, one query for many pairs) |
| `src/database/schedule.py` | Business logic that decides updates: `update_billables` (runs inside a Mongo transaction), `update_schedule`, next-send, late-task, inactive-patient queries, `archive_live_call_tasks` (post-deactivation cleanup), bot events: `queue_bot_event` (append to in-memory `BOT_EVENT_QUEUE`) and `flush_bot_events` (group, chunk, send, log) |
| `src/database/inputParams.py` | Dataclasses `UpdateBillablesContext`, `UpdateSchedulesContext` |
| `src/database/user.py` | Looks up the user named "EVOKE AUTOMATED NOTES" in `users` for activity-log attribution; returns the id as a string, cached in a module global only when found |
| `src/events/` | In-process emitter (`eventEmitter.py`) with listeners that write audit documents: `billing_activity_logger.py` (`billing_activity_logger` collection; new listener `live_call_tasks_archived` also writes per-task entries to `user_activity_logs`), `user_activity_log.py` (`user_activity_logs`) |
| `src/utils/` | `constants.py` (collection names, billing code tables, windows), `date.py`, `utils.py` (next-send cycle, billing history search), `aws.py` (SQS send), `slack.py` (error webhook), `logger.py`, `activityLogger.py` (`event_logger`), `format.py` |
| `bitbucket-pipelines.yml` | Zip and deploy per branch (see `overview.md`) |
| `requirements.txt` | Pinned Python packages (UTF-16 encoded) |
| `requirements-dev.txt` | New. Test dependencies: `pytest`, `mongomock` plus runtime pins |
| `tests/` | New. `conftest.py` (stubs `src.config`, replaces `pymongo.MongoClient` with mongomock, spies on `delete_many`; synthetic dummy values) and 5 test files, 45 test functions (parametrized cases add more): `test_billing_activity_logger.py`, `test_connection_delete_many.py`, `test_query_live_call_tasks.py`, `test_schedule_deactivation_cleanup.py`, `test_user.py` |
| `.env-example`, `.vscode/launch-example.json`, `.gitignore` | Local run helpers; `.gitignore` excludes `.env` |

Not present: README, Dockerfile, linter or formatter config, infrastructure definitions, `__init__` content (all `__init__.py` files are empty).

## Runtime flow (observed)

1. `lambda_handler` parses the event (see `overview.md`), loads patients (`get_patient` or `get_all_patients`).
2. For each patient with a `manufacturer`: `calculate_billing` -> `get_device_info` (aggregation `devices` + `device_types`), `get_account_billing_anchor` and `get_initial_report_tab_for_account_manufacturer` (`accounts`), then per active schedule re-reads the patient and calls `update_billables`.
3. `update_billables` opens a Mongo session and transaction, finds the report (`get_report`), flips billable flags (`set_billable_false`, `set_billable_true`), calls `update_schedule` -> `execute_billing_updates`, then commits. The SQS bot event is sent after commit.
4. Writes emit events (`next_send_update`, `billing_date_assigned`, `bot_lambda_invoked`, new `live_call_tasks_archived`) that append audit logs. When `update_schedule` sets a patient inactive (730 days) it executes the patient update and then `archive_live_call_tasks`, which sets `status` to `archived` on the patient's non-archived `live_call_tasks` (by id) and emits the audit event. Bot events are queued during the run and sent once by `flush_bot_events()` after the patient loop, and again in the handler's `finally` (the second call is a no-op when the queue is already empty; failures there are logged, not raised). Exceptions per patient are collected and sent to Slack once per invocation (`notify_in_slack`); the handler itself swallows exceptions after logging.

Module-level mutable state: `Mongo` singleton, `PERSISTED_VALUES` in `src/utils/constants.py` (reset after each patient with `PERSISTED_VALUES.update(default_persisted_value)` in `main.py`), and cached `user_id` in `src/database/user.py`. These survive across warm Lambda invocations (inferred).

## External systems touched

| System | How | Evidence |
|---|---|---|
| MongoDB | pymongo, URI from secret | `src/database/connection.py`, `src/config.py` |
| AWS Secrets Manager | `get_secret_value` at import time | `src/config.py` |
| AWS SQS | `send_message` to `MANUFACTURER_BOT_SQS_URL` (FIFO supported; group id is the patient id for one-patient messages, else `<manufacturer>:<account>`) | `src/utils/aws.py`, `src/database/schedule.py` |
| Slack | HTTP POST to webhook `LF_SLACK_URL` (from secret key `SLACK_URL`) | `src/utils/slack.py` |
| CloudWatch | link built from Lambda context for Slack message | `src/utils/slack.py` |
| Bitbucket Pipelines, S3, Lambda API | deploy | `bitbucket-pipelines.yml` |

`ENV_VARS.EVOKE_SLACK_URL` is loaded but not used anywhere (grep).

## Unknowns

- Lambda handler string, layers, packaging of dependencies (checked `bitbucket-pipelines.yml`, `requirements.txt`).
- Observation (EL-5610 behavior, not resolved): the task statement for this refresh says live call tasks are deleted on deactivation. At the snapshot they are archived (`status` set to `archived`); `Mongo.delete_many` exists and has tests but nothing under `src/` or `main.py` calls it (grep). Commit `5e0ef99` is titled "Delete live call tasks ..." and a later commit `b98acc7` adds activity logging with archive wording; the code at `dea0eff` is the archive variant. This matches `rest-api-evoke` (archives). Whether delete was intentionally dropped: unknown.
- Whether `src/utils/format.py` and `src/utils/activityLogger.py` are used: no imports found in `main.py` or `src/` (grep), so they are unused (also unused: `ADT_COLLECTION`, `HL7_JOBS_COLLECTION`, `ACK_COLLECTION`, `COVER_COLLECTION`, `MDT/BSX/ABT/BIO` and `MANUFACTURER_BOT_INVOKE_PER_LATE_DATE_DELTA` in `src/utils/constants.py`, and the date helpers `get_unix_timestamp`, `convert_*`, `validate_date`).
