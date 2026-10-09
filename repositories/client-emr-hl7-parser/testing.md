---
repository: client-emr-hl7-parser
analyzed_commit: b9615126ee17c4e2583e08ac81faaa9d12c63005
analyzed_branch: EL-5353 (one commit ahead of main 6e4d67e)
analyzed_at: 2026-10-09T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [git ls-files (120 tracked files), requirements.txt, bitbucket-pipelines.yml, main.py, src/config.py, src/database/connection.py, src/eventHandler/__init__.py, src/utils/aws.py, readme.md, .gitignore, git history of bitbucket-pipelines.yml, git tree of origin/lf-develop and origin/sonar]
---

# Testing Profile

Static, read-only study of `${AISDLC_REPOS_ROOT}/client-emr-hl7-parser` at the analyzed commit. Nothing was installed, imported or executed. `.env`, `.env-example` and `.vscode/launch.json` were not read (env-style files are denied), so their contents are `unknown`.

Headline finding: the repository has no automated tests of any kind, no test or lint tooling, no test configuration, and no test step in any pipeline. Every layer below is "not present", with the evidence of what was checked.

## Frameworks

- Language: Python. Lambda entry `lambda_handler(event, context)` in `main.py:9`. Python version: `unknown` (checked: no `runtime.txt`, `.python-version`, `pyproject.toml`, `Dockerfile`, IaC; the Lambda runtime and any layers are configured outside the repo).
- Test framework: none. Checked: `requirements.txt` (19 pinned runtime packages: boto3, botocore, certifi, charset-normalizer, dnspython, hl7apy, idna, jmespath, Levenshtein, mongoengine, pymongo, pymupdf, python-dateutil, python-Levenshtein, RapidFuzz, requests, s3transfer, six, urllib3) has no `pytest`, `moto`, `mongomock`, `freezegun`, `coverage`, linter or type checker. `git ls-files` lists no `tests/` directory, `conftest.py`, `pytest.ini`, `tox.ini`, `setup.cfg`, `pyproject.toml`, `Makefile`, or `package.json`. Searching the tracked `.py` files for `pytest` and `unittest` found no match.
- `src/utils/testPDF.pdf` is a tracked sample PDF, but no tracked Python file references it (grep for `testPDF` found nothing); it is not a test fixture in practice. Its use is `unknown`.
- Static quality tooling: none on `main`/`EL-5353`. The remote branch `origin/sonar` (not merged) contains a `sonar-project.properties` (`sonar.sources=.`); `main` has no Sonar file or pipeline step.
- `requirements.txt` is ASCII with CRLF line endings (observed), so the UTF-16 concern seen in a sibling repo does not apply. `mongoengine` and `pymongo` are both pinned; database access in `src/database/connection.py` uses `pymongo`.

## Test Layers

Source context: 120 tracked files; core code in `main.py` (80 lines), `hl7/` (parser, creator, extractors), `src/eventHandler/` (event handlers per type), `src/accountHandler/<account>/` (per-customer ORU/ACK/DFT logic for aspen, bond, cch, centra, covenant, denver, grand_heart, pueblo, tenet, tj_samson, toledo, uch, uch_cupid), `src/database/`, `src/utils/`. Event types in `EVENT_TYPE_MAPPER`: `ORU_CREATION`, `ADT_PARSING`, `ACK_PARSING`, `DFT_CREATION`, `IDCO_ORU_CREATION`.

| Layer | Framework | Command | Scope | Prerequisites | CI stage | Required for merge | Typical runtime | Test data strategy | Known failures/flakiness |
|---|---|---|---|---|---|---|---|---|---|
| unit | not present | none | Checked: no test files. Pure, testable candidates exist but are uncovered: `hl7/parser.py` (`parse`, `extract_information_*`), `hl7/utils.py` (`format_phone`, `merge_dicts`, `generate_control_id`), `src/utils/date.py`, `src/utils/format.py`, per-account `utils.py`/mapper constants (for example the Tenet mapper changed in HEAD commit EL-5353) | n/a | none | No (repo-side) | n/a | n/a | n/a |
| integration | not present | none | Checked: nothing exercises MongoDB, S3, Secrets Manager, Slack or the billing Lambda. Importing `main.py` or `src.database.connection` has side effects: `src/config.py` reads `.env` or else calls AWS Secrets Manager at import, and `src/database/connection.py:59` creates `Mongo = MongoConnection()` that calls `server_info()` at import | n/a | none | No | n/a | n/a | n/a |
| contract | not present | none | Checked: no schema/OpenAPI/pact files. Input event shape (`eventType`, `value`) and the outbound HL7 messages to each customer EMR (ORU, DFT) and parsed ADT/ACK inputs have no contract tests | n/a | none | No | n/a | n/a | n/a |
| API | not present | none | Checked: no HTTP routes; the Lambda is invoked with `{'eventType', 'value'}` (`main.py:11-14`). No handler-level invocation test with sample events | n/a | none | No | n/a | n/a | n/a |
| component | not present | none | Checked: no test running an event handler or account handler with faked database/S3 | n/a | none | No | n/a | n/a | n/a |
| end-to-end | not present | none | Only a manual local run exists: `python main.py --eventType <type> --value <report id or file path>` (`main.py:48-80`). Needs `.env`, real MongoDB and S3, may write to the database and S3 and send Slack messages. Not an automated test; unsafe against shared or production data | n/a | none | No | n/a | n/a | n/a |
| data-quality | not present | none | Checked: no reconciliation or validation scripts | n/a | none | No | n/a | n/a | n/a |
| migration | not present | none | Checked: no migration tool or scripts; runtime upserts/inserts only (`connection.py`) | n/a | none | No | n/a | n/a | n/a |
| performance | not present | none | Checked: no load or benchmark tooling. PDF/HL7 processing uses `pymupdf` and base64; Lambda timeout and memory are `unknown` (not in repo) | n/a | none | No | n/a | n/a | n/a |
| security | not present | none | Checked: no SAST, `pip-audit`, secret scan or dependency-update config in `bitbucket-pipelines.yml` or the repo; the unmerged `origin/sonar` branch has only a Sonar project file. Vulnerability status of pinned dependencies: `unknown` (not checked against an advisory database). The pipeline writes an OIDC web-identity token into the working tree before zipping (see `build-release.md`) | n/a | none | No | n/a | n/a | n/a |
| smoke | not present | none | Checked: the deploy steps end at `aws lambda update-function-code ... --publish`; no post-deploy invocation or health check | n/a | none | No | n/a | n/a | n/a |

## Commands

No test, lint, format or coverage command exists in the repository.

| Purpose | Command | Notes |
|---|---|---|
| Run pipeline manually (not a test, can write data) | `python main.py --eventType <ORU_CREATION\|ADT_PARSING\|ACK_PARSING\|DFT_CREATION\|IDCO_ORU_CREATION> --value <report id or file path>` | `main.py:48-80`; requires `.env` locally or Lambda env vars. Do not run from aisdlc |
| Install deps (not run) | `pip install -r requirements.txt` | Implied; no pipeline step does this (dependencies are not vendored into the zip; see `build-release.md`) |
| Tests / lint / coverage | none | Checked `requirements.txt`, file list, pipeline |

Note: `readme.md` documents `python main.lambda_handler` and a `--value <report-id>` form; neither is a test command.

## Test Data

None. No fixtures, sample HL7 messages, sample events or seed data are tracked. `.gitignore` excludes `*.hl7`, `.env`, `launch.json`, `TEST*.xml`, so local HL7 samples and reports are not versioned. Inputs a future test would need: ORU/DFT creation by report id (database documents plus a generated PDF), ADT and ACK HL7 text per customer account. Real HL7 messages and reports contain PHI: never copy into fixtures; use synthetic data.

## Fixtures and Mocks

None exist. Seams a future harness must patch (observed): the `.env`/Secrets Manager block in `src/config.py` (runs at import), the `Mongo` singleton (`src/database/connection.py:59`), S3 helpers and local file paths in `src/utils/aws.py` (`ENV_VARS.BASE_PATH`, `empty_directory()` which is called in `finally` of every `lambda_handler` run and deletes the contents of `BASE_PATH` unless a path is given: point it at a temp directory in any test), `src/utils/slack.notify_in_slack`, and the clock in `src/utils/date.py`.

## Environment Requirements

No test environment is defined. For a future harness: a Python interpreter matching the Lambda runtime (`unknown`), the `requirements.txt` packages, and an environment where `src/config.py` does not call AWS (a `.env` file in the working directory short-circuits it; its parser does `line.strip().split('=')` so values containing `=` or blank lines fall into the `except` branch and then require `SM_REGION`/`SM_NAME`). Environment variable names read in the Lambda branch (names only): `SM_REGION`, `SM_NAME`, `BASE_PATH`, `BASE_URL`, `BILLING_LAMBDA_ARN`, `PROCESSED_BUCKET`, `MANUFACTURER_BUCKET_MAPPING`; secret keys: `DB_URI`, `DATABASE_NAME`, `SLACK_URL` (stored as `LF_SLACK_URL`), `EVOKE_SLACK_URL`. Never load real values for tests.

## Database / Infrastructure Requirements

Code requires MongoDB (`DB_URI`, `DATABASE_NAME`), S3 buckets, Secrets Manager, a Slack webhook, and optionally a billing Lambda. No test infrastructure (mongomock, in-memory Mongo, LocalStack, Docker Compose) is tracked. A future harness should mock `pymongo`/boto3 or use throwaway instances; never target the databases or buckets of `lf-uat` or `main`.

## Coverage

None configured or measured (no coverage tool, no config, no report step). Effective automated coverage: 0 files. Percentage tooling: absent.

## CI Integration

Observed in `bitbucket-pipelines.yml` (two branch pipelines only): `pipelines.branches.lf-uat` and `pipelines.branches.main`. There is no `pull-requests`, `default`, `tags` or `custom` section, no `lf-qa` and no `lf-develop` pipeline on this commit (the remote `origin/lf-develop` carries its own older copy of the pipeline using self-hosted runners; its content on that branch is not analyzed beyond the first lines). No step installs dependencies, lints, tests or scans; each step zips the tree and updates a Lambda (details in `build-release.md`). Pull requests run no automated checks. A push to `lf-uat` or `main` deploys without any test. Bitbucket branch restrictions or required builds are outside the repo: `unknown`.

## Required Pre-merge Checks

Observed: none automated.

Policy guidance for aisdlc (not observed practice): evidence must come from (a) a reviewed diff, (b) for mapper/handler changes, a human-reviewed before/after table of the affected mapping (for example account, source value, mapped value) and a recorded waiver naming the missing automated layers, (c) optionally a non-writing syntax check approved by the human, and (d) the task branch name equal to the ticket. Do not run `main.py` from aisdlc: it can write to the database and S3. Merging to `lf-uat` or `main` deploys the Lambda automatically, so human review of the diff is the only gate.

## Regression Strategy

Observed: none; no tests, no changelog, no documented convention. Policy guidance (not observed practice): a bug fix needs either a first test module for the touched function (separate, explicitly approved change; keep dev dependencies in a separate `requirements-dev.txt` and exclude `tests/` from the deploy zip, since the pipeline zips the whole tree) or a recorded waiver. Highest-value first tests: `hl7/parser.py` extraction for ADT/ACK/ORU samples, `format_phone`, `merge_dicts`, `reformat_report_name`/`reformat_patient_name`, `validate_date`, and per-account mapping constants.

## Flaky / Quarantined Tests

None (no tests). Risk indicators for a future suite: import-time database and AWS access; the `finally: empty_directory()` side effect in `lambda_handler`; clock-dependent helpers in `src/utils/date.py`; `lambda_handler` swallows all exceptions and returns a status dict (`main.py:34-38`), so tests must assert on the returned dict, not on raised errors.

## Known Gaps

- No automated tests, test framework, linter, formatter, type checker, coverage or security scan; no PR pipeline; no test step before automatic deployment to UAT and production.
- Import-time side effects in `src/config.py` and `src/database/connection.py:59` make modules hard to test without patching.
- Many per-account handlers with duplicated structure (13 account folders), all untested.
- Sample file `src/utils/testPDF.pdf` is unreferenced.
- Lambda runtime version, timeout, memory, trigger, layers: `unknown` (not in repo).
- `.env-example` and `.vscode/launch.json` not read (denied): documented variable list `unknown`.
- No QA-branch pipeline in this repo; whether a QA Lambda exists is `unknown`.

## Feature Test Decision Rules

Policy guidance for aisdlc (derived from the structure above; not observed practice):

1. The repository has no test layer. For any feature or bug change, state in the plan which mandatory layers cannot run and record a waiver with reason; do not claim coverage that does not exist.
2. If adding tests is in scope (needs explicit approval, adds dependencies and files): create `tests/` with `pytest`, dev dependencies in a separate file, patch `src.config` and `src.database.connection` before import, point `BASE_PATH` at a temp directory, patch the clock, start with `hl7/parser.py`, `hl7/utils.py`, `src/utils/*` and the changed account mapper.
3. Account mapper or constants changes (for example `src/accountHandler/<account>/constants.py` or mapper files): require a before/after table of mappings in the task artifacts, reviewed by a human.
4. Database and S3 write paths: never test against shared databases or buckets; use throwaway infrastructure or record a waiver. Outbound HL7 messages and Slack payloads must be verified by inspection or a mocked client with synthetic data only (PHI never in artifacts).
5. Changes to `bitbucket-pipelines.yml` or anything shipped in the zip: see `build-release.md`; merging to `lf-uat` or `main` triggers a real deployment, so no aisdlc task may push or merge to those branches.
6. Never print or record secret values; refer to names only (`SM_REGION`, `SM_NAME`, `DB_URI`, `DATABASE_NAME`, `SLACK_URL`).
7. Any mandatory layer that cannot run needs a recorded waiver with reason before validation can pass.
