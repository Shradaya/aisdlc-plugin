---
repository: patient-billing-schedule
remote_name: patient-schedule-monitoring
analyzed_commit: ec1d8894c633996d7fc9e7a9423d21521a981bf6
analyzed_branch: main
analyzed_at: 2026-10-05T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [bitbucket-pipelines.yml, requirements.txt, main.py, src/config.py, src/database/connection.py, src/database/query.py, src/database/schedule.py, src/utils/date.py, src/utils/slack.py, src/utils/aws.py, src/utils/logger.py, .gitignore, .vscode/launch-example.json, file listing of the 27 tracked files]
---

# Testing Profile

Static study of the 27 files in the snapshot of `main` at the analyzed commit (location referred to as `${AISDLC_REPO_PATIENT_BILLING_SCHEDULE}`). Nothing was installed, imported or executed. `.env-example` was not read (access to env-style files is denied in this workspace), so its contents are `unknown`. The snapshot has no git metadata, so history and tags are `unknown`.

Headline finding: the repository has no automated tests of any kind, no test or lint tooling, no test configuration and no test step in any pipeline. Every layer below is therefore "not present" with the evidence of what was checked.

## Frameworks

- Language: Python (Lambda handler `lambda_handler(event, context)` in `main.py:266`). Python version: `unknown` (no `runtime.txt`, `.python-version`, `pyproject.toml`, `Dockerfile` or IaC tracked; the Lambda runtime is configured outside the repo).
- Test framework: none. Checked: `requirements.txt` (14 pinned runtime packages: `boto3`, `botocore`, `certifi`, `charset-normalizer`, `dnspython`, `idna`, `jmespath`, `mongoengine`, `pymongo`, `python-dateutil`, `requests`, `s3transfer`, `six`, `urllib3`) lists no `pytest`, `unittest`-adjacent, `moto`, `mongomock`, `freezegun`, `coverage`, `flake8`, `black`, `ruff`, `mypy`. Case-insensitive search of all tracked files for `test`, `pytest`, `unittest` matched only `.gitignore` (the `TEST*.xml` ignore pattern), `main.py` and `src/` (the words occur in identifiers or comments; no test code), and `bitbucket-pipelines.yml` (the word is not a step). No `tests/` directory, `conftest.py`, `pytest.ini`, `tox.ini`, `setup.cfg`, `pyproject.toml`, `Makefile` or `package.json` exists.
- `requirements.txt` is encoded in UTF-16 with a byte-order mark (observed in the raw bytes; the file reads with a NUL between characters). Whether `pip` and the CI/deploy tooling handle it is `unknown` (pip decodes BOM-marked UTF-16 in recent versions, unverified here).
- `mongoengine` is pinned but no tracked source imports it (all database access uses `pymongo` in `src/database/connection.py`); treat as an unused dependency (static grep).
- Static quality tooling: none (no linter, formatter, type checker, pre-commit config, or git hooks tracked).

## Test Layers

Source size for context: `main.py` 323 lines, 20 Python modules under `src/` totalling about 1,600 lines; core logic in `main.py` (`calculate_billing_period`, `calculate_billing`, `lambda_handler`), `src/database/schedule.py` (435 lines, `update_billables`, `update_schedule`, `update_next_send`) and `src/database/query.py` (418 lines), constants in `src/utils/constants.py`.

| Layer | Framework | Command | Scope | Prerequisites | CI stage | Required for merge | Typical runtime | Test data strategy | Known failures/flakiness |
|---|---|---|---|---|---|---|---|---|---|
| unit | not present | none | Checked: no test files, no runner in `requirements.txt`. Pure, easily testable candidates exist: `calculate_billing_period` and `get_active_schedules` in `main.py`, `src/utils/date.py` (`add_days`, `subtract_days`, `truncate_time_from_date`), `src/utils/utils.py`, `src/utils/format.py`, query builders in `src/database/schedule.py` (`prepare_*_query`). They are not covered | n/a | none | No (repo-side). aisdlc policy: see Feature Test Decision Rules | n/a | n/a | n/a |
| integration | not present | none | Checked: no spec touches MongoDB, Secrets Manager, SQS or Slack. Importing `src/config.py` has side effects (reads a local `.env` file, otherwise reads env names `SM_REGION` and `SM_NAME` and calls AWS Secrets Manager at import time, `src/config.py:12-37`), and `src/database/connection.py:127` instantiates `Mongo = MongoConnection()` at import, which opens a `pymongo.MongoClient` and calls `server_info()` (`connection.py:55-56`). Any test that imports `main.py` or `src.database.*` without patching these will try to reach a real database | n/a | none | No | n/a | n/a | n/a |
| contract | not present | none | Checked: no schema, OpenAPI, JSON-schema or pact files. Input events (API-Gateway-style `body`, SQS `Records` with `account` / `patient_id`, or direct `patient_id`; `main.py:274-286`) and outbound SQS payloads (`src/utils/aws.py`, `schedule.py:318`) have no contract tests | n/a | none | No | n/a | n/a | n/a |
| API | not present | none | Checked: the Lambda has no HTTP routes in this repo; `main.py:274-275` accepts a `body` JSON string (suggesting an API Gateway or Function URL invoker, unverified). No handler-level invocation test with sample events | n/a | none | No | n/a | n/a | n/a |
| component | not present | none | Checked: no test that runs `calculate_billing` with a faked database layer | n/a | none | No | n/a | n/a | n/a |
| end-to-end | not present | none | Only a manual local run exists: `python main.py --patient <patient id>` (`main.py:311-323`; `.vscode/launch-example.json` passes `--patient`). It requires a real database and loads `.env` or Secrets Manager, and it performs real writes (`update_billables`, `update_schedule`, SQS sends). Not an automated test and not safe against shared or production data | n/a | none | No | n/a | n/a | n/a |
| data-quality | not present | none | Checked: no reconciliation or validation scripts | n/a | none | No | n/a | n/a | n/a |
| migration | not present | none | Checked: no migration tool or scripts; the repo performs data updates at runtime on patient/task documents (`updateMany`, `upsert`, `delete` in `connection.py`) with no schema migration layer | n/a | none | No | n/a | n/a | n/a |
| performance | not present | none | Checked: no load or benchmark tooling. Note `lambda_handler` loops all patients of an account sequentially and queries per schedule (`main.py:156-158` re-fetches the patient per schedule), so runtime scales with account size; Lambda timeout and memory are `unknown` (not in repo) | n/a | none | No | n/a | n/a | n/a |
| security | not present | none | Checked: no SAST, `pip-audit`, `safety`, secret scan or dependency-update config in `bitbucket-pipelines.yml` or the repo. Dependencies are exact-pinned in `requirements.txt` (some are old for the 2026 analysis date, for example `urllib3==2.2.1`, `requests==2.31.0`, `certifi==2024.2.2`; vulnerability status `unknown`, not checked against an advisory database). See `build-release.md` for the pipeline finding about a web-identity token in the deployment package | n/a | none | No | n/a | n/a | n/a |
| smoke | not present | none | Checked: no post-deploy invocation or health check in `bitbucket-pipelines.yml`; the deploy step ends at `aws lambda update-function-code ... --publish` | n/a | none | No | n/a | n/a | n/a |

## Commands

No test, lint, format or coverage command exists in the repository. The only runnable entry point is the manual script below, which is not a test and must not be run against shared or production data.

| Purpose | Command | Notes |
|---|---|---|
| Run for one patient (manual, writes data) | `python main.py --patient <patient id>` | `main.py:311-323`. Needs `.env` (local) or `SM_REGION` and `SM_NAME` (Secrets Manager). Real database writes and SQS sends. Not a test |
| Install deps (not run) | `pip install -r requirements.txt` | Implied by `requirements.txt`; no pipeline step does this (see `build-release.md`) |
| Tests / lint / coverage | none | Checked `requirements.txt`, root files, pipeline |

## Test Data

None. No fixtures, sample events, sample patient documents, seed data or `tests/` directory are tracked. The `.gitignore` excludes `.env`, `*.hl7`, `launch.json` and `TEST*.xml`, so local data and reports are not versioned. Domain inputs a future test would need to construct: patient documents (fields read in `main.py:111-132`: `doi`, `_id`, `account`, `manufacturer`, `late_date`, `serial_number`, `deviceInformation.modelName`, `device`, `billingHistory`, `implanted_billing_schedule`, `next_send`), device info (`get_device_info`), account billing anchor and initial report tab settings, signed report dates. Real patient data is PHI: never copy it into fixtures; use synthetic records.

## Fixtures and Mocks

None exist. Seams a future harness would need to patch (observed): `src.config.ENV_VARS` and the import-time Secrets Manager call (`src/config.py`), the `Mongo` singleton (`src/database/connection.py:127`), `src/utils/aws.send_sqs_message` (boto3 SQS), `src/utils/slack.notify_in_slack` (`requests.post`), and the clock via `src/utils/date.get_current_date` (uses `datetime.datetime.now()`, local timezone of the Lambda, normally UTC; so time-dependent logic needs a patched clock). `main.py` also relies on module-level mutable state (`PERSISTED_VALUES.update(...)` in `lambda_handler`, `main.py:301`), so tests must reset it between cases.

## Environment Requirements

No test environment is defined. For a future harness: a Python interpreter matching the Lambda runtime (`unknown`), `requirements.txt` packages, and an environment where `src/config.py` does not call AWS: a `.env` file in the working directory short-circuits the Secrets Manager path (`config.py:12-17`); note that parser `line.strip().split('=')` will fail on values containing `=` or on blank lines (observed code behavior), so a test `.env` must have exactly one `=` per line. Environment variable names read: `SM_REGION`, `SM_NAME` (names only). Keys expected in the secret or `.env`: `DB_URI`, `DATABASE_NAME`, `SLACK_URL` (stored as `LF_SLACK_URL`), `EVOKE_SLACK_URL`, `MANUFACTURER_BOT_SQS_URL`. Never load real values for tests; `.env-example` content is `unknown` (not read).

## Database / Infrastructure Requirements

The code requires a MongoDB reachable through `DB_URI` and `DATABASE_NAME`; collection names and schema are in `src/database/query.py` and `schedule.py` (see the data-model and interfaces docs of this repository). Outbound: AWS SQS (queue URL from `MANUFACTURER_BOT_SQS_URL`, FIFO supported), Slack webhook, AWS Secrets Manager. No test infrastructure (in-memory Mongo, `mongomock`, LocalStack, Docker Compose) is tracked. A future harness should mock `pymongo` or use a throwaway Mongo; never target the databases used by `lf-qa`, `lf-uat` or `main`.

## Coverage

None configured or measured (no `coverage`/`pytest-cov`, no config, no Sonar file, no report step). Effective coverage of tracked code by automated tests: 0 files (there are no tests). Percentage tooling: `unknown`/absent.

## CI Integration

Observed in `bitbucket-pipelines.yml` (73 lines): only `pipelines.branches` entries for `lf-qa` (lines 3-25), `lf-uat` (27-49) and `main` (51-73). There is no `pull-requests`, `default`, `tags` or `custom` section, no `lf-develop` branch pipeline (the sibling services have one; here it is absent), and no step that installs dependencies, lints, tests or scans. Each branch step only zips the repository and updates a Lambda (see `build-release.md`). Consequently pull requests run no automated checks (observed: no `pull-requests` section), and a push to `lf-qa`, `lf-uat` or `main` deploys without any test. Bitbucket branch restrictions or required builds are outside the repo: `unknown`.

## Required Pre-merge Checks

Observed: none automated by the repository.

Policy guidance for aisdlc (not observed practice): since no test or lint tooling exists, evidence for a change must come from (a) syntax check by reading or a non-executing method, (b) a reviewed diff against the billing-window rules in `main.py` and `src/utils/constants.py`, (c) for logic changes, a recorded waiver naming the missing automated layer plus manual evidence (for example a documented dry run against a non-production database by a human), and (d) the task branch name equal to the ticket (there is no PR pipeline pattern here). Do not run `python main.py --patient ...` from aisdlc: it writes to the configured database. Because merging to `lf-qa`, `lf-uat` or `main` deploys the Lambda automatically, human review of the diff is the only gate.

## Regression Strategy

Observed: none; no tests, no changelog, no documented convention. Policy guidance (not observed practice): for a bug fix, introduce the first test module for the touched function as a separate, explicitly approved change (new test dependencies change `requirements.txt` and, since the deploy zips the whole tree, would also ship into the Lambda package; keep test dependencies in a separate file such as `requirements-dev.txt` and extend the pipeline zip exclusions accordingly). Until a harness exists, a bug requires a recorded waiver for regression coverage. Highest-value first tests: boundary cases of `calculate_billing_period` (pre/post ideal windows for CardioMEMS, day 31 and day 91 codes, first-time versus recurring, summary-report ("LINQ") flag, `only_next_send`, backbill when `current_date >= ideal_period_end_date`), signature-anchor behavior, `day_custom` schedules, and `lambda_handler` event parsing (`body`, `Records`, direct `patient_id`).

## Flaky / Quarantined Tests

None (no tests). Risk indicators for a future suite (observed in code): current date from `datetime.datetime.now()` (`src/utils/date.py:7-8`) makes results depend on the run date; `main.py:133` mutates `billingHistory` in place with `.reverse()` on the patient document; global mutable `PERSISTED_VALUES`; import-time AWS and database access.

## Known Gaps

- No automated tests, test framework, linter, formatter, type checker, coverage or security scan; no PR pipeline; no test step before automatic deployment to QA, UAT and production.
- Import-time side effects (`src/config.py`, `src/database/connection.py:127`) make the modules hard to test without refactoring or heavy patching.
- Exceptions are swallowed: `calculate_billing` returns an error string and `lambda_handler` catches all exceptions and only logs (`main.py:258-263, 307-308`), so failures can pass silently except for Slack notifications built from per-patient errors; the whole-handler `except` does not notify Slack.
- `requirements.txt` UTF-16 encoding and unused `mongoengine` pin; dependencies exact-pinned but possibly outdated and unscanned.
- The `.env` loader in `src/config.py` splits on every `=` and breaks on values containing `=`.
- Lambda runtime version, timeout, memory, trigger and layers: `unknown` (not in repo), which also limits test-environment parity.
- `.env-example` was not read (denied), so the documented variable list is `unknown`.

## Feature Test Decision Rules

Policy guidance for aisdlc (derived from the structure above; not observed practice):

1. The repository has no test layer. For any feature or bug change, state in the plan which mandatory layers cannot run and record a waiver with reason; do not claim coverage that does not exist.
2. If the task scope includes adding tests (needs explicit approval, since it adds dependencies and files): create `tests/` with `pytest`, put dev dependencies in a separate file, patch `src.config` and `src.database.connection` before import, patch the clock, and start with pure functions (`calculate_billing_period`, date helpers, query builders).
3. Billing-window or schedule constant changes (`src/utils/constants.py`, `main.py`): require a table of before/after window boundaries for each billing code and flag (recurring/first-time, summary report, only-next-send) in the task artifacts, reviewed by a human, since no automated check exists.
4. Database write paths (`src/database/schedule.py`, `query.py`): never test against shared databases; verify with a throwaway database or record a waiver. Outbound payloads (SQS bot events, Slack) must be asserted by inspection or by a mocked client.
5. Changes to `bitbucket-pipelines.yml`, or anything shipped in the Lambda zip: see `build-release.md`; merging to `lf-qa`, `lf-uat` or `main` triggers a real deployment, so no aisdlc task may push or merge to those branches.
6. Never print or record secret values; refer to names only (`SM_REGION`, `SM_NAME`, `DB_URI`, `DATABASE_NAME`, `SLACK_URL`).
7. Any mandatory layer that cannot run needs a recorded waiver with reason before the task can pass validation.
