---
repository: patient-billing-schedule
remote_name: patient-schedule-monitoring
analyzed_commit: dea0eff5ed6fd7d5a9ee734cd132862a27a4fb31
previous_analyzed_commit: ec1d8894c633996d7fc9e7a9423d21521a981bf6
analyzed_branch: main
analyzed_at: 2026-10-15T08:45:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [bitbucket-pipelines.yml, requirements.txt, requirements-dev.txt, tests/conftest.py, tests/test_billing_activity_logger.py, tests/test_connection_delete_many.py, tests/test_query_live_call_tasks.py, tests/test_schedule_deactivation_cleanup.py, tests/test_user.py, main.py, src/config.py, src/database/connection.py, .gitignore, file listing of the 34 files in the snapshot, changed-files list and commit subjects of ec1d889..dea0eff]
---

# Testing Profile

Static study of the 34 files in the snapshot of `main` at the analyzed commit (location referred to as `${AISDLC_REPO_PATIENT_BILLING_SCHEDULE}`). Nothing was installed, imported or executed; no test was run, so pass/fail status and runtime are `unknown`. `.env-example` was not read (access to env-style files is denied in this workspace), so its contents are `unknown`. The snapshot has no git metadata, so history and tags are `unknown`; the commit subjects of the refresh range were supplied as a list.

Headline finding (changed since `ec1d889`): the repository now has a pytest suite (EL-5610, commit `5e0ef99`, extended by `b98acc7`): `requirements-dev.txt`, `tests/conftest.py` and 5 test modules, 45 test functions that collect to 53 test cases. The suite is narrow (only the live-call-task archive on 730-day deactivation, its audit event, `Mongo.delete_many` and the user cache; see Known Gaps) and is NOT run by any pipeline: `bitbucket-pipelines.yml` is unchanged in substance (only `lf-qa`, `lf-uat` and `main` deploy steps, no install or test step).

## Frameworks

- Language: Python (Lambda handler `lambda_handler(event, context)` in `main.py`). Python version: `unknown` (no `runtime.txt`, `.python-version`, `pyproject.toml`, `Dockerfile` or IaC tracked; the Lambda runtime is configured outside the repo).
- Test framework: `pytest==9.1.1` (`requirements-dev.txt`, exact pin; whether this version exists on PyPI and which Python it needs: `unknown`, not verified). Only `pytest` features used: fixtures (incl. `autouse`), `monkeypatch`, `parametrize`; no custom markers, no plugins.
- Mock database: `mongomock==4.3.0`. Other mock tooling: stdlib `unittest.mock` (`MagicMock`, `mock.patch`-style via `monkeypatch`). No `moto`, no `freezegun`, no `pytest-cov`, no `coverage`.
- `requirements-dev.txt` (ASCII, CRLF, 7 lines) pins: `pytest`, `mongomock`, `pymongo==4.6.3`, `boto3==1.34.88`, `botocore==1.34.88`, `python-dateutil==2.9.0.post0`, `requests==2.31.0`. It does not `-r requirements.txt`; it duplicates a subset of the runtime pins by hand (these match the runtime pins by name; exact equality with `requirements.txt` was not verified because that file is UTF-16 and was not decoded here). Packages not listed there that tests may need transitively (for example `bson` comes with `pymongo`, `dnspython`): `unknown`.
- Test configuration: none. No `pytest.ini`, `tox.ini`, `setup.cfg`, `pyproject.toml`, `.coveragerc` or `Makefile` (checked the snapshot root). Import path is set by `tests/conftest.py` (inserts the repository root into `sys.path`), so `pytest` is expected to run from any directory with the repo root layout, but this was not executed.
- `requirements.txt` is UTF-16 LE with a BOM (re-verified raw bytes `ff fe`), while `requirements-dev.txt` is ASCII; whether `pip` and the deploy tooling handle the UTF-16 file is `unknown`.
- `mongoengine` is pinned in `requirements.txt` but no tracked source imports it (static grep re-run on the new snapshot: no import).
- Static quality tooling: none (no linter, formatter, type checker, pre-commit config or git hooks tracked).

## Test Layers

Tests: 5 modules, 45 `def test_` functions (8 + 7 + 14 + 14 + 2), 53 collected cases after expanding 4 `parametrize` decorators (5 + 2 + 2 + 3 cases for 4 functions: 53 = 45 + 4 + 1 + 1 + 2). Lines: `conftest.py` 155, tests 786 (941 total). Counts are static (grep of `def test_` and `parametrize`); a collection run was not done.

| Module | Test functions | Cases | Subject |
|---|---|---|---|
| `tests/test_billing_activity_logger.py` | 8 | 12 | `live_call_tasks_archived` listener in `src/events/billing_activity_logger.py` (writes to the billing log and user activity log collections, upsert failure not swallowed, registration on the emitter event) |
| `tests/test_connection_delete_many.py` | 7 | 8 | `Mongo.delete_many` in `src/database/connection.py` (deleted count, empty/None filter rejected before any driver call, session pass-through, error propagation) |
| `tests/test_query_live_call_tasks.py` | 14 | 17 | `archive_live_call_tasks_by_patient_id` in `src/database/query.py` (archive non-archived tasks, ObjectId or 24-hex string, invalid id errors, write conflict propagated with a single attempt, idempotent re-run) and a constants check |
| `tests/test_schedule_deactivation_cleanup.py` | 14 | 14 | deactivation cleanup in `src/database/schedule.py` (event emitted once with specified arguments, no event when nothing archived, errors propagate, `update_schedule` calls cleanup once only when the patient is set inactive and after the patient update) |
| `tests/test_user.py` | 2 | 2 | `src/database/user.py` cache (found user cached, missing user not cached) |

The suite is code-level only. Layer table (every applicable layer; the repo defines no layer names, classification is by content):

| Layer | Framework | Command | Scope | Prerequisites | CI stage | Required for merge | Typical runtime | Test data strategy | Known failures/flakiness |
|---|---|---|---|---|---|---|---|---|---|
| unit | pytest + `unittest.mock` (collaborators patched via fixtures: `collaborators` in `test_schedule_deactivation_cleanup.py`, `upsert_spy`, `monkeypatch`) | `pytest` (inferred, not stated anywhere in the repo; not run) | 45 test functions / 53 cases across the 5 modules, in particular the schedule cleanup orchestration, the live-call-task query function with fake collaborators, and the event listener | `pip install -r requirements-dev.txt` (inferred; Python version `unknown`) | none (no pipeline step runs tests) | No (no automated gate) | unknown (not run; modules are small and in-memory) | inline synthetic dicts and `ObjectId`s | none known; status of the suite itself is `unknown` (never executed in this study) |
| integration | pytest + `mongomock` replacing `pymongo.MongoClient` (database-level behavior against an in-memory fake, not a real MongoDB) | `pytest` (same run) | `Mongo.delete_many`, `archive_live_call_tasks_by_patient_id`, listener upserts and the end-to-end cleanup (`test_deactivation_cleanup_end_to_end_archives_and_audits`) against the in-memory DB. Real MongoDB behavior (transactions, write conflicts, server semantics) is not exercised: mongomock rejects real sessions, so the spies strip `session` before delegating | as above | none | No | unknown | synthetic documents inserted into mongomock; DB name `test_billing_db`; database dropped before each test | mongomock may differ from real MongoDB (the session handling workaround shows one such difference) |
| contract | not present | none | Checked: no schema, OpenAPI, JSON-schema or pact files. Input events (API-Gateway-style `body`, SQS `Records`, direct `patient_id`) and outbound SQS payloads have no contract tests. `test_query_live_call_tasks.py` asserts "specified values" of constants and the cleanup tests assert event arguments, but these are not consumer contracts | n/a | none | No | n/a | n/a | n/a |
| API | not present | none | Checked: the Lambda has no HTTP routes in the repo; no test invokes `lambda_handler` with sample events (grep of `tests/` for `lambda_handler` and `main` imports found no use: `main.py` is not imported by any test) | n/a | none | No | n/a | n/a | n/a |
| component | not present | none | Checked: no test runs `calculate_billing` or `lambda_handler` with a faked database layer; only the end-to-end cleanup test above spans more than one function, and it is classified under integration | n/a | none | No | n/a | n/a | n/a |
| end-to-end | not present | none | Only the manual local run `python main.py --patient <patient id>` exists (writes data, needs a real database and `.env` or Secrets Manager). Not an automated test and not safe against shared or production data | n/a | none | No | n/a | n/a | n/a |
| data-quality | not present | none | Checked: no reconciliation or validation scripts | n/a | none | No | n/a | n/a | n/a |
| migration | not present | none | Checked: no migration tool or scripts; runtime data updates only | n/a | none | No | n/a | n/a | n/a |
| performance | not present | none | Checked: no load or benchmark tooling | n/a | none | No | n/a | n/a | n/a |
| security | not present | none | Checked: no SAST, `pip-audit`, `safety`, secret scan or dependency-update config in `bitbucket-pipelines.yml` or the repo. Dependency vulnerability status `unknown` (not checked against an advisory database). See `build-release.md` for the web-identity-token packaging finding | n/a | none | No | n/a | n/a | n/a |
| smoke | not present | none | Checked: no post-deploy invocation or health check in `bitbucket-pipelines.yml` | n/a | none | No | n/a | n/a | n/a |

## Commands

No test command is documented in the repo (no README, `Makefile`, script or pipeline step). Commands below are inferred from the files and were NOT run.

| Purpose | Command | Notes |
|---|---|---|
| Install test dependencies (inferred) | `pip install -r requirements-dev.txt` | Pins pytest, mongomock and a runtime subset. Not stated in the repo |
| Run all tests (inferred) | `pytest` (from the repository root) | No config file; default discovery finds `tests/test_*.py`. `tests/conftest.py` stubs `src.config` and replaces the Mongo client, so no network, `.env` or AWS credentials should be needed (static reading) |
| Run one module / case (inferred) | `pytest tests/test_user.py` or `pytest tests/test_user.py::test_found_user_is_cached` | Standard pytest selection |
| Lint / format / type check | none | Checked `requirements*.txt`, root files, pipeline |
| Coverage | none | No `coverage` / `pytest-cov` pinned or configured |
| Run for one patient (manual, writes data) | `python main.py --patient <patient id>` | Real database writes and SQS sends. Not a test. Never run from aisdlc |

## Test Data

Inline synthetic data only, built in the test modules: `ObjectId()` values, small task/patient dicts inserted into mongomock, and constants like `DATA` in `test_billing_activity_logger.py`. No fixture files, JSON samples, seed data or factories. `tests/conftest.py` defines dummy environment values (`ENV_VARS`: `DB_URI` pointing at a `.invalid` host, `DATABASE_NAME=test_billing_db`, `.invalid` URLs for the Slack webhooks and the bot SQS queue); these are synthetic placeholders, not credentials. `.gitignore` still excludes `.env`, `*.hl7`, `launch.json`, `TEST*.xml` (note `TEST*.xml` would ignore pytest JUnit output named `TEST-*.xml`). Domain inputs not yet represented (billing patient documents read in `main.py`, device info, billing history, signed report dates) are PHI in production: use synthetic records only.

## Fixtures and Mocks

Defined in `tests/conftest.py` (155 lines):

- Module-level harness (runs before any `src` import): inserts the repo root in `sys.path`; replaces `sys.modules["src.config"]` with a stub exposing dummy `ENV_VARS` (so the import-time Secrets Manager call and `.env` reading in `src/config.py` never happen); replaces `pymongo.MongoClient` (and `pymongo.mongo_client.MongoClient`) with a factory that returns a `mongomock.MongoClient` and records it in `_MOCK_CLIENTS`, so the import-time `Mongo = MongoConnection()` singleton in `src/database/connection.py` binds to the fake.
- `_isolated_state` (autouse): drops every database of the mock clients before each test, resets `Mongo.session`, and monkeypatches `src.utils.aws.send_sqs_message` and `src.utils.slack.notify_in_slack` with `MagicMock` so no SQS or Slack call can leave the process.
- `mongo`: the `Mongo` singleton. `db`: the in-memory database `test_billing_db`.
- `driver_delete_many_spy` and `driver_update_many_spy`: wrap `mongomock.collection.Collection.delete_many` / `update_many`, record call args, optionally raise `spy.error`, strip the `session` kwarg (mongomock rejects real sessions) and call through.
- Module-local fixtures: `upsert_spy` (`test_billing_activity_logger.py`), `collaborators` (`test_schedule_deactivation_cleanup.py`), an `autouse` fixture in `test_user.py`, and a fixture around line 151 of `test_query_live_call_tasks.py`.

Not mocked or patched anywhere: the clock (`src/utils/date.get_current_date` uses `datetime.datetime.now()`; the current tests do not appear to depend on it, but this was not verified for each test), and module state in `main.py` (`PERSISTED_VALUES`), because `main.py` is not imported by tests.

## Environment Requirements

A Python interpreter matching the Lambda runtime (version `unknown`), the packages in `requirements-dev.txt`, and no network, no AWS credentials, no `.env` file and no running database (static reading of `conftest.py`). Process environment variables are not required by the tests (`SM_REGION`, `SM_NAME` are bypassed by the `src.config` stub). Because the stub replaces `src.config` at conftest import, tests that import `main.py` would also get the stub, but `main.py` imports were not analyzed against the stub (`unknown`). Never load real values for tests.

## Database / Infrastructure Requirements

None beyond the Python packages: the database is `mongomock` in process. Real MongoDB, AWS (SQS, Secrets Manager) and Slack are replaced or stubbed. No Docker Compose, LocalStack or throwaway MongoDB is tracked. Behaviors that need a real server (multi-document transactions via `session`, write conflict retry, indexes, aggregation operators unsupported by mongomock) are untested. Never target the databases used by `lf-qa`, `lf-uat` or `main`.

## Coverage

No coverage tooling or threshold configured (no `coverage`, `pytest-cov`, `.coveragerc`, Sonar file or report step). Measured percentage: `unknown`. Static file-level view: the tests import `src.events.billing_activity_logger`, `src.database.connection`, `src.database.query` (one function), `src.database.schedule` (cleanup path and `update_schedule`), `src.database.user`, `src.database.inputParams`, plus `src.utils.aws` and `src.utils.slack` (patched). `main.py` (billing calculation, handler), `src/utils/date.py`, `constants.py` (only partly via one constants test), `format.py`, `utils.py` and most of `schedule.py` / `query.py` have no direct tests.

## CI Integration

Observed in `bitbucket-pipelines.yml` (73 lines, same three branch pipelines as before): `lf-qa`, `lf-uat` and `main` only; each step zips the repository and updates a Lambda. There is no `pull-requests`, `default`, `tags` or `custom` section, no `pip install`, no `pytest` and no lint or scan step (grep for `pytest`, `pip` and `requirements` in the file: no match). Therefore: the new tests do NOT run in CI; pull requests run no automated checks; a push to `lf-qa`, `lf-uat` or `main` deploys without running tests. Bitbucket branch restrictions or required builds are outside the repo: `unknown`. Side effect of the new files on the deploy: `tests/` and `requirements-dev.txt` are now included in the Lambda zip (the zip script deletes only `.gitignore`, `bitbucket-pipelines.yml` and `.git`); see `build-release.md`.

## Required Pre-merge Checks

Observed: none automated by the repository.

Policy guidance for aisdlc (not observed practice): a human or the aisdlc validation phase must run the suite locally before merge, because CI does not. Proposed command set (inferred, not stated by the repo): `pip install -r requirements-dev.txt` in a clean virtual environment, then `pytest` from the repository root; all tests must pass, and the result is recorded in the task artifacts. This is safe by construction (mongomock, stubbed config, patched SQS and Slack) but the harness has not been executed in this study, so the first run should be treated as verification of the harness itself. Additional evidence for logic outside the suite (billing window rules in `main.py`, `src/utils/constants.py`): reviewed diff and a recorded waiver naming the missing layer. Do not run `python main.py --patient ...` from aisdlc. Merging to `lf-qa`, `lf-uat` or `main` deploys the Lambda automatically, so human review remains a gate.

## Regression Strategy

Observed: tests exist only for the EL-5610 live-call-task cleanup and supporting functions; no changelog or documented convention. Policy guidance (not observed practice): for a bug fix in a covered area, add a failing test to the matching module in `tests/` reusing the `conftest.py` fixtures. For a bug in an uncovered area (billing calculation in `main.py`, date helpers, query builders), add a new test module; note that `main.py` has not been imported under the harness, so the first such test must confirm that the `src.config` stub and mongomock replacement are sufficient (import-time side effects), and must patch the clock. New test dependencies belong in `requirements-dev.txt`, not `requirements.txt`. Highest-value gaps to cover first: boundary cases of `calculate_billing_period` (pre/post ideal windows for CardioMEMS, day 31 and day 91 codes, first-time versus recurring, summary-report flag, `only_next_send`, backbill), signature-anchor behavior, `day_custom` schedules, and `lambda_handler` event parsing (`body`, `Records`, direct `patient_id`).

## Flaky / Quarantined Tests

None quarantined; no skip/xfail markers found in `tests/` (grep for `skip`, `xfail` markers: only `parametrize` was found). Flakiness history `unknown` (no CI runs, no tests executed in this study). Risk indicators (observed in code): the tests rely on monkeypatching `mongomock` internals (`Collection.delete_many`, `update_many`), which can break on a mongomock upgrade; `pymongo.MongoClient` is replaced globally at conftest import, so import order matters (anything importing `src.database.connection` before conftest would bind a real client; `Mongo = MongoConnection()` calls `server_info()` at import); `main.py:133` mutates `billingHistory` in place and `PERSISTED_VALUES` is global, which matter once handler tests are added.

## Known Gaps

- Tests are not run in CI: no install or test step, no PR pipeline, and automatic deployment to QA, UAT and production is not gated by them.
- Coverage is narrow: nothing covers `main.py` (`calculate_billing_period`, `calculate_billing`, `lambda_handler`), `src/utils/*`, the bulk of `src/database/schedule.py` and `query.py`, or the SQS/Slack payload shapes; the batching and payload-size changes of EL-5444 (`main.py`, `src/events/eventEmitter.py`, `src/utils/constants.py`: commits `32a6a88`, `1ae9887`, `c8f6352`, `b366d2e`, `b20bbcd`, `8ad9185`, `9f15fb2`) have no tests in `tests/` (no test file references them; `eventEmitter` is used only to check listener registration in one test).
- No documented way to run the tests (no README, no pipeline step); commands here are inferred.
- No coverage measurement, linter, formatter, type checker or security scan.
- mongomock is not MongoDB: transactions/session and write-conflict behavior are emulated by spies, so real-server behavior of `delete_many`, `update_many` and the cleanup transaction is unverified.
- `requirements-dev.txt` duplicates a subset of runtime pins by hand (drift risk) and `pytest==9.1.1` availability was not verified.
- Exceptions are swallowed in `main.py` (per-patient error strings; whole-handler `except` only logs), unchanged from the earlier analysis (not re-verified line by line after the EL-5444 edits to `main.py`).
- `requirements.txt` UTF-16 encoding and unused `mongoengine` pin; `.env` loader splits on every `=` (earlier finding; `src/config.py` unchanged in this range).
- Lambda runtime version, timeout, memory, trigger and layers: `unknown`, limiting test-environment parity. `.env-example` not read (denied).
- No test has been executed in this study: the suite's actual pass state is `unknown`.

## Feature Test Decision Rules

Policy guidance for aisdlc (derived from the structure above; not observed practice):

1. Unit and integration (mongomock) layers exist for the live-call-task cleanup area only. For changes there, add or update tests in `tests/` and run `pytest` locally; record the result as evidence. For any other area state which mandatory layers cannot run and record a waiver with reason; do not claim coverage that does not exist.
2. Writing tests follows the existing harness: put them in `tests/test_<topic>.py`, use `conftest.py` fixtures (`mongo`, `db`, spies), synthetic data only, no real secrets; add dev dependencies to `requirements-dev.txt`. Patch the clock for date-dependent logic. Confirm first that importing the target module works under the `src.config` stub.
3. Because CI runs no tests, aisdlc validation must run the suite itself (`pytest`, local, safe by construction) before commit; the PR/CI stage will not do it. If the harness cannot run (dependency or Python version problem), record a waiver and the error.
4. Billing-window or schedule constant changes (`src/utils/constants.py`, `main.py`): require a table of before/after window boundaries per billing code and flag in the task artifacts, reviewed by a human, plus new unit tests for `calculate_billing_period` when feasible.
5. Database write paths (`src/database/schedule.py`, `query.py`, `connection.py`): test with mongomock; transaction or write-conflict behavior needs a throwaway real MongoDB or a recorded waiver. Never test against shared databases. Outbound SQS and Slack are patched by the autouse fixture; assert payloads through the mocks.
6. Changes to `bitbucket-pipelines.yml`, or anything shipped in the Lambda zip (including `tests/` and `requirements-dev.txt`): see `build-release.md`; merging to `lf-qa`, `lf-uat` or `main` triggers a real deployment, so no aisdlc task may push or merge to those branches.
7. Never print or record secret values; refer to names only (`SM_REGION`, `SM_NAME`, `DB_URI`, `DATABASE_NAME`, `SLACK_URL`).
8. Any mandatory layer that cannot run needs a recorded waiver with reason before the task can pass validation. Bugs need regression coverage or a recorded waiver.
