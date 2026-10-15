---
repository: manufacturer-crawler
analyzed_commit: d6aa388a03c12e777846a704818ba5903a021a4f
analyzed_branch: main
analyzed_at: 2026-10-15T08:55:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [file listing of the snapshot (70 files excluding .env.example), bitbucket-pipelines.yml, Dockerfile, .dockerignore, .gitignore, requirements.txt, sonar-project.properties, README.md, main.py, eventHandler/test_report.py, eventHandler/event_schema.py, utils/secretString.py, utils/config.py, grep for pytest/unittest across the snapshot]
---

# Testing Profile

Static study of an exact `git archive` snapshot of `origin/main` at the analyzed commit (location `${AISDLC_REPOS_ROOT}/manufacturer-crawler`). Nothing was installed, imported or executed; no browser was opened. `.env.example` and any `.env` were not read, so their contents are `unknown`. The snapshot has no git metadata, so history and tags are `unknown`.

Headline finding: the repository has NO automated tests. There is no `tests/` directory, no pytest/unittest config, no test dependency in `requirements.txt` (checked: no `pytest`, `mongomock`, `moto`, `responses`, `coverage`), and a grep of the whole snapshot for `pytest` and `unittest` matched only `.dockerignore` (`.pytest_cache`). The pipeline runs no test step. The README documents only manual verification by invoking the deployed Lambda with sample events.

Test-like files that are NOT tests:

- `eventHandler/test_report.py` defines `test_report_event_handler(database, event)`, the handler for the `TEST_REPORT` event type (reads report documents by `_id` from the database and returns them). It is production code imported by `eventHandler/__init__.py` and called from `main.py`. Its name matches pytest default discovery (`test_*.py`, `test_*` function): a future `pytest` run from the repository root would collect it and fail with "fixture 'database' not found" (static reasoning, not run). Any pytest configuration added must exclude it (for example `testpaths = tests`) or the file should be renamed.
- `eventHandler/event_schema.py` defines a pydantic class `TestReportEvent`; pytest would only warn about it if collected, and the file is not matched by default discovery.
- `eventHandler/bot_trigger.py`, `bot_triggers.py`, `cron_job.py`, `recrawl.py`, `disconnected_monitors.py` are event handlers/producers (each has an `"eventType"` payload), not tests.
- `.gitignore` ignores `TEST*.xml` (JUnit output named `TEST-*.xml` would be ignored).
- `sonar-project.properties` is the only quality tooling file: `sonar.projectKey` names a different repository (`manufacturer-hl7-parser`, with a generated suffix) and `sonar.sources=.`; no test, coverage or exclusion properties. No pipeline step runs a Sonar scan (checked `bitbucket-pipelines.yml`). Observation only: probable copy from the sibling repository; any scan using it would report into the other project; its actual use is `unknown`.

## Frameworks

- Language: Python; runtime Python 3.14 (Lambda container image `public.ecr.aws/lambda/python:3.14`, `Dockerfile`). Handler `main.lambda_handler`.
- Test framework: none. Mock tooling: none. Coverage tooling: none. Linter/type checker: none configured. `README.md` recommends `black` (formatter, not pinned or enforced; no config file).
- Runtime libraries relevant to testability (`requirements.txt`, exact pins): `selenium==4.47.0`, `webdriver-manager==4.1.2` (only used in local mode), `pymongo==4.17.0`, `boto3==1.43.68`, `pydantic==2.13.4`, `slack_sdk==3.43.0`, `requests==2.34.2`, `python-dotenv==1.2.2`. Whether these versions exist on PyPI and support Python 3.14 was not verified.
- No `pytest.ini`, `tox.ini`, `setup.cfg`, `pyproject.toml`, `Makefile` or `.coveragerc` (checked snapshot root).

## Test Layers

The repo defines no layer names; classification is by content. Every layer below was checked by file listing and grep.

| Layer | Framework | Command | Scope | Prerequisites | CI stage | Required for merge | Typical runtime | Test data strategy | Known failures/flakiness |
|---|---|---|---|---|---|---|---|---|---|
| unit | not present | none | Checked: no `tests/` directory, no `test_*.py` apart from the non-test `eventHandler/test_report.py`, no `unittest.TestCase` or pytest import anywhere. Pure candidates exist (`formats/formatDate.py`, `formats/formatName.py`, `utils/dates.py`, `utils/helpers.py`, `eventHandler/event_schema.py` pydantic validation) but are untested | n/a | none | No | n/a | n/a | n/a |
| integration | not present | none | Checked: no mongomock, moto, LocalStack, Docker Compose or throwaway database tooling. Database code (`database/*.py`) targets MongoDB via `pymongo` and the connection is made from secrets at import/run time (`utils/config.py` calls `get_secret()` at import) | n/a | none | No | n/a | n/a | n/a |
| contract | not present | none | Checked: no JSON schema, OpenAPI or pact files. Event shapes are enforced at runtime by pydantic models in `eventHandler/event_schema.py` (`validate_event_payload`), which is validation code, not a test. Manufacturer portal page structure (the real external contract) has no recorded fixtures or checks | n/a | none | No | n/a | n/a | n/a |
| API | not present | none | Checked: the Lambda exposes no HTTP routes in the repo; no test invokes `lambda_handler` with sample events (README lists manual sample events instead) | n/a | none | No | n/a | n/a | n/a |
| component | not present | none | Checked: no test runs a manufacturer crawler (`manufacturer/*`) against saved HTML or a fake driver, and no test runs `run_lambda_handler` with a fake driver/database | n/a | none | No | n/a | n/a | n/a |
| end-to-end | not present as automated test | manual only: invoke the deployed Lambda (README names function `bot_lambda`) with a sample event such as `BOT_EVENT_TRIGGER` | Manual README procedure drives a real headless Chrome against a LIVE manufacturer portal using real stored account credentials and writes reports/logs to the database and posts to Slack. Not safe for aisdlc; never run | AWS access, secrets, real database | none | No | unknown | real production-like data (PHI) | unknown; portals may change markup or throttle/lock accounts |
| data-quality | not present | none | Checked: no reconciliation or validation scripts. (`database/run_aggregation.py` and `database/export.py` are runtime code, not checks) | n/a | none | No | n/a | n/a | n/a |
| migration | not present | none | Checked: no migration tool, scripts or schema versioning; the database is MongoDB with runtime document updates | n/a | none | No | n/a | n/a | n/a |
| performance | not present | none | Checked: no load or benchmark tooling. Lambda timeout/memory/concurrency are configured outside the repo (`unknown`) | n/a | none | No | n/a | n/a | n/a |
| security | not present | none | Checked: no SAST, dependency audit, secret scan, container image scan or dependency-update config in the repo or pipeline. `sonar-project.properties` exists but is not run by the pipeline and names another project. Vulnerability status of the Chrome 114-era browser and the pins is `unknown`. See `build-release.md` findings | n/a | none | No | n/a | n/a | n/a |
| smoke | not present | none | Checked: no post-deploy invocation or health check in `bitbucket-pipelines.yml` (the last step is `aws lambda update-function-code`) | n/a | none | No | n/a | n/a | n/a |

## Commands

No test command exists. Commands in the README are for running and invoking the bot, not testing.

| Purpose | Command | Notes |
|---|---|---|
| Install runtime deps (README) | `pip install -r requirements.txt` (inside a virtualenv) | Documented; not run. Requires a Python version compatible with the pins (3.14 in the image) |
| Run locally (README) | `python main.py` | README says to "manually call the lambda_handler function". `main.py` has no `if __name__ == "__main__"` block (grep: none in the snapshot), so as written this imports the module and does nothing; local runs need a driver script that calls `lambda_handler(event, context)`. Importing `main` or `utils.config` calls `get_secret()` (Secrets Manager) at import time: needs `SM_NAME`/`SM_REGION` and AWS credentials, otherwise the secret object is empty and the handler reports "Unable to load secrets". Do not run from aisdlc |
| Local browser mode | env `LOCAL_EXECUTION=true` plus `CHROME_BINARY_LOCATION_PATH` and `SELENIUM_SERVICE_EXECUTABLE_PATH` (names from `utils/secretString.py`) | Only switches Chrome paths (and `SLACK_URL` override). It does not mock the portals or the database |
| Lint / format | `black .` (README recommendation only) | Not enforced, not pinned |
| Coverage | none | |
| Static syntax sanity (safe, offline, inferred) | `python -I -m compileall -q .` in a copy of the snapshot | Not run; only verifies syntax, imports nothing, no network. Optional for aisdlc validation of a change |
| Invoke deployed Lambda (README) | AWS console test event, `eventType` one of `BOT_EVENT_TRIGGER`, `BOT_EVENTS_TRIGGER`, `GET_DISCONNECTED_MONITORS` (also supported in code: `RECRAWL`, `TEST_REPORT`, `CRON_JOB`) | Hits live portals and the real database. Never from aisdlc |

## Test Data

None in the repo: no fixtures, sample HTML pages, recorded responses, seed data or factories. Domain data (patient reports, manufacturer account credentials stored in the database, device transmissions) is PHI and secret material in production. Any future tests must use synthetic documents and saved synthetic HTML only. `.gitignore` excludes `.env` and `.venv` and `*.log`.

## Fixtures and Mocks

None. No test double exists for: Selenium driver (`create_chrome_driver` in `main.py` builds a real `webdriver.Chrome`), MongoDB (`setConnection`), Secrets Manager (`utils/secretString.get_secret`, called at import), SQS/Slack (`utils/slack.py`), S3 (`utils/exportToS3.py`), the clock (`utils/dates.py`, `get_utc_now`). Import-time side effects (`the module-level SECRET set from get_secret()` in `utils/config.py`, temp directories at `main.py` import) mean any test module importing `main` or `utils` must patch `boto3`/env before import.

## Environment Requirements

For the (nonexistent) tests: nothing is defined. For running the bot: Python 3.14 image or compatible interpreter, Chrome and chromedriver matching each other (see `build-release.md`; the image uses `/opt/chromedriver` and `/opt/chrome-linux/chrome`), and environment names `SM_NAME`, `SM_REGION` (Secrets Manager), optional `SLACK_URL`, `LOCAL_EXECUTION`, `CHROME_BINARY_LOCATION_PATH`, `SELENIUM_SERVICE_EXECUTABLE_PATH`, `PROCESSED_BUCKET` (`utils/config.py`). Secret-held keys referenced in code (names only): `SLACK_URL`, `SLACK_URL_NOSHOW`, `ERROR_SLACK_URL`, `BOT_CHANNEL_ID`, `EVOKE_ALERT_TOKEN`, plus the database settings used by `setConnection` (not read in detail). `.env.example` not read: further names `unknown`. Never load real values for tests.

## Database / Infrastructure Requirements

Runtime needs MongoDB (via `pymongo`; connection built from the secret), AWS Secrets Manager, S3 (export), SQS (bot trigger producers in `eventHandler/`), and Slack. No Docker Compose, LocalStack or throwaway MongoDB is tracked. Environments (QA, UAT, development) are `unknown`: the pipeline only deploys `main` to a Production deployment. There is no known safe shared test database; do not use the production database for verification.

## Coverage

No coverage tooling, threshold, Sonar coverage property or report. Measured percentage: `unknown`; by static evidence 0 percent of code is covered by automated tests. Source size indication: `main.py` 461 lines, `eventHandler/*.py` 1552 lines in total, plus the four manufacturer packages (Abbott_Merlin, Biotronik, Boston_Scientific, Medtronic_Carelink) and `database/`, `utils/`, `formats/`.

## CI Integration

`bitbucket-pipelines.yml` has only `pipelines.branches.main` with one step marked `deployment: "Production"`, using the `docker` service. The script logs in to ECR, runs `docker build`, `docker push` and two `aws lambda update-function-code` calls (details in `build-release.md`). There is no `pull-requests`, `default`, `tags` or `custom` pipeline, no install/test/lint/scan step, and no post-deploy check. Therefore pull requests run no automated checks and a push to `main` deploys to production untested. The Docker build itself is the only implicit validation (it fails if `pip install` or the base-image downloads fail). Bitbucket branch restrictions and required builds are outside the repo: `unknown`.

## Required Pre-merge Checks

Observed: none automated by the repository. The Docker build only runs after merge, on `main`.

Policy guidance for aisdlc (not observed practice): there is no suite to run, so validation for a change must rely on (1) reviewed diff, (2) offline syntax check (`python -I -m compileall -q .` on a copy), (3) offline unit-style verification of pure logic added or changed (pydantic event validation, date/name formatting, parsing helpers) using a throwaway script or new tests with all collaborators faked, and (4) a recorded waiver naming each missing mandatory layer (component, integration, smoke). Do not invoke the Lambda, import `main` with real credentials, or open a browser against a live portal. A merge to `main` deploys to production automatically, so human review is the real gate.

## Regression Strategy

Observed: none; no changelog or tests. Policy guidance: for a bug fix in a parser or formatter, add a test with a saved synthetic HTML/JSON snippet that reproduces it (new `tests/` directory, a pytest configuration with `testpaths = tests` so `eventHandler/test_report.py` is not collected, dev dependencies in a separate `requirements-dev.txt` that is not copied into the image path used by the Lambda). For bugs that depend on portal behavior, record the observed portal condition and the account/manufacturer in the task artifacts; a recorded waiver is required where it cannot be reproduced offline. Highest-value first coverage: `eventHandler/event_schema.py` validation, `formats/*`, `utils/dates.py`, report parsing inside each manufacturer package given saved HTML, and the SQS-record batch/retry logic in `run_lambda_handler` (`main.py`) with a fake driver.

## Flaky / Quarantined Tests

None (no tests). Risk indicators for future tests (observed in code): crawlers drive a real browser with `--single-process` and `--no-zygote` in the image; portal markup, MFA/captcha and login throttling are external; module-level temp directories and `SECRET` are created at import; `reset_browser` and the shared `driver` are reused across SQS records.

## Known Gaps

- No automated tests of any layer; no test dependencies; no documented test command.
- No CI gating: pipeline deploys `main` to production with no test, lint or scan step; no PR pipeline.
- `eventHandler/test_report.py` is a handler whose name collides with pytest discovery; it would fail collection-time fixture resolution if pytest were run without configuration.
- `sonar-project.properties` references another repository's project key; no scan is wired in.
- No way to exercise crawlers without live manufacturer portals: no recorded pages, fake driver, or fake database.
- Import-time side effects (Secrets Manager call in `utils/config.py`) make module import non-hermetic.
- README's `python main.py` instruction does not match code (no `__main__` entry).
- No non-production environments are visible, so there is no known place to run an end-to-end check safely.
- Python 3.14 compatibility of the pinned dependencies and the Chrome 114-era browser pairing were not verified.

## Feature Test Decision Rules

Policy guidance for aisdlc (derived from the structure above; not observed practice):

1. No mandatory layer can currently be run from the repo. Every task must state which layers are waived and why; do not claim coverage that does not exist.
2. Safe verification without live portals: (a) syntax check on a copy; (b) unit-style checks of pure functions and pydantic event models with synthetic inputs and no imports of `main` or `utils.config` (they call Secrets Manager at import) unless `boto3` and environment are patched first; (c) for parsing changes, use saved synthetic HTML snippets and a fake Selenium element/driver; (d) for database changes, a fake or mocked collection layer, never a shared database. Never open Chrome against a manufacturer portal, never use stored account credentials, never invoke the deployed Lambda.
3. If adding tests, create `tests/`, add pytest configuration with `testpaths = tests`, keep dev dependencies out of `requirements.txt` (that file is baked into the image), and mind `.dockerignore` (it does not exclude `tests/`, so new tests would be copied into the image by `COPY . ${LAMBDA_TASK_ROOT}`).
4. Changes to `Dockerfile`, `requirements.txt` or `bitbucket-pipelines.yml` change the production image and deploy: require a human-reviewed plan; the only possible pre-merge check is a local image build in a disposable environment, if the developer chooses to (not run here).
5. Changes to event handling (`eventHandler/event_schema.py`, `main.py`): offline tests of every `eventType` payload shape (valid and invalid) with the pydantic models.
6. Never print or record secret values; refer to names only (`SM_NAME`, `SM_REGION`, `SLACK_URL`).
7. Bugs need regression coverage or a recorded waiver; a bug that only reproduces on a live portal needs the waiver plus human confirmation after deploy.
8. Merging to `main` deploys to production: no aisdlc task may push or merge to `main`.
