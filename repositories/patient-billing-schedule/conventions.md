---
repository: patient-billing-schedule
analyzed_commit: dea0eff5ed6fd7d5a9ee734cd132862a27a4fb31
analyzed_branch: main
analyzed_at: 2026-10-15T08:45:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [main.py, src/config.py, src/database/connection.py, src/database/query.py, src/database/schedule.py, src/events/eventEmitter.py, src/utils/logger.py, src/utils/constants.py, src/utils/date.py, src/database/user.py, src/events/billing_activity_logger.py, bitbucket-pipelines.yml, requirements-dev.txt, tests/conftest.py, tests/test_query_live_call_tasks.py]
refresh_note: Refreshed from ec1d8894 to dea0eff. Touched: Layout (tests/), Request flow (bot event queue/flush, archive cleanup), Error handling, Lint/format/tests, Things to follow.
---

# Conventions (Phase J)

Written by the onboarding orchestrator after the repository-analyst's write was refused; checked against the `main` snapshot at the analyzed commit.

## Layout and naming
- `main.py` at the root holds the billing orchestration and `lambda_handler`; everything else is under `src/`: `config.py`, `database/` (`connection.py`, `query.py`, `schedule.py`, `inputParams.py`, `user.py`), `events/` (`eventEmitter.py`, `billing_activity_logger.py`, `user_activity_log.py`), `utils/` (`constants.py`, `date.py`, `format.py`, `utils.py`, `logger.py`, `slack.py`, `aws.py`, `activityLogger.py`). New: `tests/` at the root (`conftest.py`, `test_<area>.py`, test names `test_<behavior_in_words>`), and `requirements-dev.txt`.
- Functions, variables and most modules are `snake_case`; some modules are `camelCase` (`inputParams.py`, `eventEmitter.py`, `activityLogger.py`); classes are `PascalCase` (`MongoConnection`, `EventEmitter`, `UpdateBillablesContext`). Billing rules and windows are `UPPER_SNAKE_CASE` constants in `src/utils/constants.py`.
- Imports are absolute from the repository root (`from src.utils.logger import log`).

## Request flow patterns
- One invocation = one `lambda_handler` call: resolve patients from the event (`patient_id`, `body`, or SQS `Records` with `account`/`patient_id`), loop over patients, call `calculate_billing` per patient, collect error strings, notify Slack once at the end (`main.py`).
- Database access goes through the module singleton `Mongo` (`src/database/connection.py`, `MongoConnection`) and query helpers in `src/database/query.py`; write-side updates are built by `prepare_*_query` helpers and executed in `src/database/schedule.py`; the write functions in `src/database/query.py` are wrapped by `retry_on_write_conflict` (defined there).
- Bot events are two-phase: `queue_bot_event` appends to the module-level `BOT_EVENT_QUEUE`, `flush_bot_events` groups by (manufacturer, account), chunks by `BOT_EVENT_MAX_PATIENT_IDS` (70) and sends; `lambda_handler` calls the flush after the patient loop and again in `finally` (`main.py`). A one-patient group keeps the original payload shape, so consumers need no change in the common case (docstring in `src/database/schedule.py`).
- Cleanup that follows a deactivation is a helper called after the update (`archive_live_call_tasks`), which emits `LIVE_CALL_TASKS_ARCHIVED_EVENT`; event names and action strings for it are constants in `src/utils/constants.py`.
- Side effects after a change are announced through the event emitter (`src/events/eventEmitter.py`) and logged by the `events/` modules.
- Module-level mutable state is used on purpose (`PERSISTED_VALUES` in `src/utils/constants.py`, reset per patient in `lambda_handler`).

## Error handling
- Per patient: `calculate_billing` catches everything and returns `"<serial> <---> <error>"`; the handler collects these and posts them to Slack (`main.py`). The outer `try/except` in `lambda_handler` only logs, so the function always returns success.
- `retry_on_write_conflict` retries a transaction and returns `None` after the last failure instead of raising, and accepts positional arguments only (`src/database/query.py`).
- No custom exception types. New helpers validate input with `ValueError` (`archive_live_call_tasks_by_patient_id`, `Mongo.delete_many`); the archive helper is intentionally not wrapped by `retry_on_write_conflict`, and tests assert a write conflict propagates after one attempt (`tests/test_query_live_call_tasks.py`). SQS send failures in `flush_bot_events` are caught, logged with `log.error` and recorded per patient in `manufacturer_crawler_report_status`.

## Configuration
- `src/config.py` builds a single `ENV_VARS` dot-dict: from a local `.env` if present, else from Secrets Manager (`SM_NAME`, `SM_REGION`). Importing the module therefore reads a file or calls AWS (side effect at import).
- Business rules (billing codes, windows, schedules, description strings) are constants, not configuration (`src/utils/constants.py`).

## Logging
- One shared logger (`src/utils/logger.py`, format `[LEVEL] time module:function - message`, level INFO). Almost everything is `log.info`, including caught exceptions; `log.warning` and `log.error` are used once each in `src/database/schedule.py`. A few `print` calls remain (`src/database/schedule.py`, `src/utils/slack.py`).

## Git, commits, branches
- Branch pipelines exist for `lf-qa`, `lf-uat` and `main` (`bitbucket-pipelines.yml`); `lf-develop` has none. Recent history on `main` uses `<ticket>: <summary>` commits and "Merged in <ticket> (pull request #N)" merges (git log of the clone, `EL-5467` on 2026-09-15).

## Lint, format, tests
- Tests: pytest with mongomock, installed from `requirements-dev.txt`; `tests/conftest.py` sets up `sys.path`, stubs `src.config` and the Mongo client before any `src` import, with synthetic dummy values. 5 test files, 45 test functions; areas covered are the activity logger, `Mongo.delete_many`, live call task archiving, deactivation cleanup and the user lookup. Nothing covers `flush_bot_events` or `main.py` (grep of `tests/`). No pytest config file and no CI test step (`bitbucket-pipelines.yml`).
- Still none: linter, formatter, pre-commit hook or README (see `testing.md`). Style is by hand: 4-space indent, long lines (over 100 characters), SHOUTING comments in places.

## Things to follow when changing code
- Keep the shared `Mongo` singleton and the `prepare_*_query` plus `execute_billing_updates` split; do not open new connections.
- Add new billing codes or windows in `src/utils/constants.py` and check every `in` test: `CARDIO_MEMS_BILLING_CODES` is the string `"93264"` (not a tuple), so membership is a substring test.
- Reset any new module-level state in `lambda_handler` the way `PERSISTED_VALUES` is.
- Do not log patient names, dates of birth or phone numbers; task descriptions already carry them.
- A push to `lf-qa`, `lf-uat` or `main` deploys automatically with no tests; run `pytest` locally first.
- Do not mutate `BOT_EVENT_QUEUE` outside `queue_bot_event`/`flush_bot_events`: that bypasses the grouping and the 70-patient cap.
- Use `Mongo.delete_many` only with a non-empty filter; it raises otherwise. Live call tasks are archived, not deleted, in the current code (and in `rest-api-evoke`).

## Unknowns
- Intended Python version and formatter (none declared).
- Whether `lf-develop` is deployed by another mechanism.
- Code-review and branch-protection rules in Bitbucket.
