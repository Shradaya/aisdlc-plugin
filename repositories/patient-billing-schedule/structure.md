---
repository: patient-billing-schedule
analyzed_commit: ec1d8894c633996d7fc9e7a9423d21521a981bf6
analyzed_branch: main
analyzed_at: 2026-10-05T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [main.py, src/config.py, src/database/connection.py, src/database/query.py, src/database/schedule.py, src/database/inputParams.py, src/database/user.py, src/events/eventEmitter.py, src/events/billing_activity_logger.py, src/events/user_activity_log.py, src/utils/activityLogger.py, src/utils/aws.py, src/utils/slack.py, src/utils/constants.py, src/utils/date.py, src/utils/utils.py, src/utils/format.py, src/utils/logger.py, bitbucket-pipelines.yml, requirements.txt]
---

# Structure (Phase B)

27 files at the snapshot (no `.git`, so counts are from a directory listing).

## Top level

| Path | Role |
|---|---|
| `main.py` | Lambda handler `lambda_handler`, per-patient orchestration `calculate_billing`, window calculation `calculate_billing_period`, CLI entry |
| `src/config.py` | Loads `ENV_VARS`: local `.env` file if present, otherwise AWS Secrets Manager |
| `src/database/connection.py` | Singleton pymongo wrapper `Mongo` (find, find_one, upsert, insert, updateMany, delete, run_aggregation); optional transaction `session` |
| `src/database/query.py` | All query and write functions against `patients`, `reports`, `devices`, `accounts`, `tasks`, `manufacturer_crawler_report_status`; `retry_on_write_conflict` decorator |
| `src/database/schedule.py` | Business logic that decides updates: `update_billables` (runs inside a Mongo transaction), `update_schedule`, next-send, late-task, inactive-patient queries, `send_bot_event_to_sqs` |
| `src/database/inputParams.py` | Dataclasses `UpdateBillablesContext`, `UpdateSchedulesContext` |
| `src/database/user.py` | Looks up the user named "EVOKE AUTOMATED NOTES" in `users` for activity-log attribution |
| `src/events/` | In-process emitter (`eventEmitter.py`) with listeners that write audit documents: `billing_activity_logger.py` (`billing_activity_logger` collection), `user_activity_log.py` (`user_activity_logs`) |
| `src/utils/` | `constants.py` (collection names, billing code tables, windows), `date.py`, `utils.py` (next-send cycle, billing history search), `aws.py` (SQS send), `slack.py` (error webhook), `logger.py`, `activityLogger.py` (`event_logger`), `format.py` |
| `bitbucket-pipelines.yml` | Zip and deploy per branch (see `overview.md`) |
| `requirements.txt` | Pinned Python packages (UTF-16 encoded) |
| `.env-example`, `.vscode/launch-example.json`, `.gitignore` | Local run helpers; `.gitignore` excludes `.env` |

Not present: tests, README, Dockerfile, linter or formatter config, infrastructure definitions, `__init__` content (all `__init__.py` files are empty).

## Runtime flow (observed)

1. `lambda_handler` parses the event (see `overview.md`), loads patients (`get_patient` or `get_all_patients`).
2. For each patient with a `manufacturer`: `calculate_billing` -> `get_device_info` (aggregation `devices` + `device_types`), `get_account_billing_anchor` and `get_initial_report_tab_for_account_manufacturer` (`accounts`), then per active schedule re-reads the patient and calls `update_billables`.
3. `update_billables` opens a Mongo session and transaction, finds the report (`get_report`), flips billable flags (`set_billable_false`, `set_billable_true`), calls `update_schedule` -> `execute_billing_updates`, then commits. The SQS bot event is sent after commit.
4. Writes emit events (`next_send_update`, `billing_date_assigned`, `bot_lambda_invoked`) that append audit logs. Exceptions per patient are collected and sent to Slack once per invocation (`notify_in_slack`); the handler itself swallows exceptions after logging.

Module-level mutable state: `Mongo` singleton, `PERSISTED_VALUES` in `src/utils/constants.py` (reset after each patient with `PERSISTED_VALUES.update(default_persisted_value)` in `main.py`), and cached `user_id` in `src/database/user.py`. These survive across warm Lambda invocations (inferred).

## External systems touched

| System | How | Evidence |
|---|---|---|
| MongoDB | pymongo, URI from secret | `src/database/connection.py`, `src/config.py` |
| AWS Secrets Manager | `get_secret_value` at import time | `src/config.py` |
| AWS SQS | `send_message` to `MANUFACTURER_BOT_SQS_URL` (FIFO supported) | `src/utils/aws.py`, `src/database/schedule.py` |
| Slack | HTTP POST to webhook `LF_SLACK_URL` (from secret key `SLACK_URL`) | `src/utils/slack.py` |
| CloudWatch | link built from Lambda context for Slack message | `src/utils/slack.py` |
| Bitbucket Pipelines, S3, Lambda API | deploy | `bitbucket-pipelines.yml` |

`ENV_VARS.EVOKE_SLACK_URL` is loaded but not used anywhere (grep).

## Unknowns

- Lambda handler string, layers, packaging of dependencies (checked `bitbucket-pipelines.yml`, `requirements.txt`).
- Whether `src/utils/format.py` and `src/utils/activityLogger.py` are used: no imports found in `main.py` or `src/` (grep), so they are unused (also unused: `ADT_COLLECTION`, `HL7_JOBS_COLLECTION`, `ACK_COLLECTION`, `COVER_COLLECTION`, `MDT/BSX/ABT/BIO` and `MANUFACTURER_BOT_INVOKE_PER_LATE_DATE_DELTA` in `src/utils/constants.py`, and the date helpers `get_unix_timestamp`, `convert_*`, `validate_date`).
