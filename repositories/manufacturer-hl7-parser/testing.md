---
repository: manufacturer-hl7-parser
analyzed_commit: e185ff36fe03c649cd7e9750e895c8c43f857c43
analyzed_at: 2026-10-01T17:37:23Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [tests/conftest.py, tests/unit/**, requirements.txt, bitbucket-pipelines.yml, src/config.py, src/database/connection.py]
---

# Testing profile (Phase G)

Static study only: no tests were run, so pass/fail status and runtime are `unknown`.

## Frameworks

pytest style (12 of 13 test files) with `unittest.mock`, `SimpleNamespace` and `dotdict` fakes. `requirements.txt` declares no pytest, mock library or coverage tool. No `pytest.ini`, `pyproject.toml`, `tox.ini`, `setup.cfg`, `Makefile`, Dockerfile or `.python-version` was found, so the Python version is `unknown`.

## Test Layers

| Layer | Framework | Command | Scope | Prerequisites | CI stage | Required for merge | Typical runtime | Test data strategy | Known failures/flakiness |
|---|---|---|---|---|---|---|---|---|---|
| unit | pytest + mock | `pytest tests/unit` from repo root (inferred; not documented) | 13 files, ~60 tests, ~1,550 lines: `src/utils/date.py` (`validate_date`, `get_next_bill_send_date`, `TimeConverter`), `src/notes/utils.py`, `src/delay_message_processing.py`, `src/database/query.py` (`create_billing_diagnosis_code`, `delete_live_call_task_by_patient_id`, `upsert_into_patients`), `src/processor.py` (`map_billing_codes`, `update_billing_codes` only), note creators (burden, arrhythmias, battery, pacing percentage) | Importable `src.config` (see Environment Requirements) | none | No (no pipeline gate) | unknown | In-code fakes and mocks | See Flaky section |
| integration | not present | none | Checked: `tests/` tree, fixtures, pipeline: no Mongo/AWS integration tests | | none | No | unknown | none | unknown |
| contract | not present | none | Checked: no schema/contract tests for SQS payloads, billing Lambda or Mongo | | none | No | unknown | none | unknown |
| API | not present (no HTTP surface) | none | | | none | No | unknown | none | unknown |
| component | not present | none | Pipeline `process` untested end to end | | none | No | unknown | none | unknown |
| end-to-end | not present | none | Checked: no sample `.hl7` fixtures (`*.hl7`, `*.pdf` are git-ignored) | | none | No | unknown | none | unknown |
| data-quality | not present | none | | | none | No | unknown | none | unknown |
| migration | not present (no migrations in repo) | none | | | none | No | unknown | none | unknown |
| performance | not present | none | | | none | No | unknown | none | unknown |
| security | not present | none | Checked: no SAST/dependency scan in pipeline | | none | No | unknown | none | unknown |
| smoke | not present | none | Checked: no post-deploy check in pipeline | | none | No | unknown | none | unknown |

## Commands

No documented test command. Inferred: `pytest tests/unit` from the repository root. `tests/conftest.py:1-4` only adds the repo root to `site` paths and defines no fixtures.

## Test Data

In-test literals and fakes. No HL7/PDF fixtures committed (`.gitignore` excludes `*.hl7`, `*.pdf`).

## Fixtures and Mocks

`unittest.mock` patches of query functions and `Mongo`; `SimpleNamespace` patient/account stand-ins; an autouse fixture restores `DelayMessageProcessing.rules`. Patching `Mongo` happens after the import-time config read, so it does not avoid the config coupling below.

## Environment Requirements

`src/config.py:14-47` runs at import: it reads `.env` from the current directory, else calls Secrets Manager using `SM_REGION`/`SM_NAME`, and reads env vars `BASE_PATH`, `BILLING_LAMBDA_ARN`, `PROCESSED_BUCKET`, `ERROR_PATH`, `BENCHMARK_SQS`, `CARDIO_ONE_SQS`, `DELAY_SQS`. `.env-example` documents the key names. `src/database/connection.py:140` creates `Mongo = MongoConnection()` at import. Eight test files import something that reaches this chain, so on a clean machine they probably fail at collection without a `.env` or AWS access (inferred, unverified): the three `src_database_query` tests, `test_delay_message_processing.py`, `test_update_billing_codes.py`, and the burden, arrhythmias and battery note-creator tests. Five files do not reach `src.config`: `test_validate_date.py`, `test_next_send.py`, `test_time_converter.py`, `test_contains_keyword_in_context.py`, `test_pacing_percentage.py`.

## Database / Infrastructure Requirements

None documented for tests. Unit tests are meant to mock the database. A real MongoDB replica set would be needed for transaction tests; none exist.

## Coverage

None configured, none measured. No tests exist for: `hl7/` (incl. 355-line `obxMapper.py`), `pdf/`, `src/manufacturer/*` (~1,250 lines), `main.py`, most of `src/processor.py` (618 lines; 2 functions tested), `src/analytics`, `src/artanis`, `src/events`, AWS/Slack/format utilities, 8 of 12 note creators, most of `src/database/query.py`.

## CI Integration

`bitbucket-pipelines.yml` runs no tests, lint, install or scan. The only reference to tests is `zip ... -x "tests/*"`. Pipelines exist only for branches `lf-develop`, `lf-qa`, `lf-uat`, `main`; no `pull-requests`, `default`, `tags` or `custom` section, so nothing runs on feature branches or PRs. Bitbucket-side branch restrictions and merge checks are `unknown`.

## Required Pre-merge Checks

None defined in the repository. Local pytest evidence is the only available gate, and pushing to an `lf-*` branch or `main` deploys immediately.

## Regression Strategy

Policy guidance (not observed practice): extend the matching test file under `tests/unit/<area>/`; for bugs in untested areas (`hl7/`, `pdf/`, manufacturers) add a unit test around the extracted function or record a waiver with reason and manual evidence.

## Flaky / Quarantined Tests

No skip/xfail/quarantine markers. Static fragility risks (unverified): `test_next_send.py:13-26` re-implements the production roll-forward loop and reads the real clock (`date.today()`, `src/utils/date.py:20`); class-level mutable state (`DelayMessageProcessing.rules`, alert flags in `test_arrhythmias.py`); the `Mongo` singleton and the `user_id` global in `src/database/user.py`; import-time config coupling.

## Known Gaps

All layers except unit are absent; no CI test gate; pytest undeclared; large untested core (parsing, PDF scraping, manufacturers, main flow); config at import makes tests environment-dependent.

## Feature Test Decision Rules

Policy guidance: run `pytest tests/unit` with a throwaway `.env` (never real values); add unit tests for new pure logic (billing mapping, date/billing schedule, delay rules, note creators); keep Mongo and AWS mocked; freeze dates; for changes in `hl7/`, `pdf/`, `src/manufacturer/` or `main.py`, supply sample-file manual evidence because no automated layer exists; any mandatory layer that cannot run needs a recorded waiver.
