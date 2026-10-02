---
repository: manufacturer-hl7-parser
analyzed_commit: e185ff36fe03c649cd7e9750e895c8c43f857c43
analyzed_at: 2026-10-01T17:37:23Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/config.py, bitbucket-pipelines.yml, src/utils/aws.py, src/utils/slack.py, src/database/query.py, src/database/user.py, src/constants.py, main.py]
---

# Security baseline (Phase I)

No secret values are recorded here; names only.

## Secrets and configuration (names only)

- Secrets Manager id from env `SM_NAME`, region from `SM_REGION` (`src/config.py:23-24`). Secret keys read: `DB_URI`, `DATABASE_NAME`, `SLACK_URL` (loaded as `LF_SLACK_URL`), `EVOKE_SLACK_URL` (optional).
- Env vars: `BASE_PATH`, `BILLING_LAMBDA_ARN`, `PROCESSED_BUCKET`, `ERROR_PATH`, `BENCHMARK_SQS`, `CARDIO_ONE_SQS`, `DELAY_SQS`. `ARTANIS_AI_LAMBDA` is referenced but never set on the Lambda path.
- `.env-example` lists: `DB_URI`, `DATABASE_NAME`, `LF_SLACK_URL`, `EVOKE_SLACK_URL`, `region_name`, `SecretId`, `BASE_PATH`, `BILLING_LAMBDA`, `PROCESSED_BUCKET`, `ERROR_PATH`, `BENCHMARK_SQS`, `CARDIO_ONE_SQS` (no values). It lacks `DELAY_SQS`/`ARTANIS_AI_LAMBDA`.
- Pipeline variables: `AWS_REGION`, `AWS_ROLE_ARN`, `DEV_LAMBDA_RESOURCE_BUCKET`, `PROD_LAMBDA_RESOURCE_BUCKET`, `DEV_LAMBDA_NAME`, `QA_LAMBDA_NAME`, `UAT_LAMBDA_NAME`, `ABBOT_LAMBDA_NAME`, `BOSTON_LAMBDA_NAME`, `MDT_LAMBDA_NAME`, `BIOT_LAMBDA_NAME`, `BITBUCKET_STEP_OIDC_TOKEN` (Bitbucket-provided). Deploy auth uses OIDC web identity, not static keys.
- Hardcoded secrets: none found (scanned `.py`, `.yml`, `.json`, `.md`, `.txt`). `.env`, `*.hl7`, `*.pdf`, `launch.json` are git-ignored.

## Authn/authz

No inbound auth surface (event-driven). Access control is AWS IAM on S3/SQS/Lambda; none of it is in this repo (`unknown`). Application identity: a `users` document named "EVOKE AUTOMATED NOTES" is used for `created_by`/`updated_by` (`src/database/user.py`); if missing, the id becomes an empty string.

## Findings

| # | Finding | Evidence | Confidence |
|---|---|---|---|
| 1 | The OIDC token is written to `web-identity-token` in the working directory (`bitbucket-pipelines.yml:15`) before `zip -r $ZIP_NAME . -x "tests/*"` (`:22`), so the file is in the zip uploaded to S3 and deployed. Same pattern on all four branches. Inferred from script order; no built artifact was inspected. The token is short-lived. | bitbucket-pipelines.yml | medium |
| 2 | A push to `main` deploys one zip to four production Lambdas with no tests, no `trigger: manual` and no approval step in the file. Bitbucket-side deployment protections are `unknown`. Conflicts with the aisdlc rule that production writes are disabled by default; merge to `main` must stay human-controlled. | bitbucket-pipelines.yml:78-108 | high |
| 3 | `empty_directory()` runs in `finally` and calls `os.listdir(ENV_VARS.BASE_PATH)`. If `BASE_PATH` is unset, `os.listdir(None)` lists the current directory and files there are deleted. On Lambda `/var/task` is read-only (OSError is caught); a local run with `.env` lacking `BASE_PATH` could delete working-directory files. | src/utils/aws.py:130-144, main.py:141 | high (code) / medium (impact) |
| 4 | `src/config.py:20` uses a bare `except:`; `.env` parsing uses `line.split('=')`, so a value containing `=` (a Mongo URI with query parameters) raises and silently falls back to Secrets Manager with whatever `SM_NAME` the machine has. | src/config.py:14-22 | medium |
| 5 | Regex built from HL7 name fields without `re.escape` in `get_patient_by_name_dob`: over-matching patients, possible ReDoS. Name fields are filtered by `generalExtractor` (`[^a-zA-Z\-. ]`), which reduces but does not remove the risk. | src/database/query.py:50-51 | high (missing escape) / low (exploitability) |
| 6 | PHI exposure paths: PDF S3 key contains patient family/given name (`reformat_report_name`); Slack messages include S3 keys, serial numbers, file names, account names and tracebacks; CloudWatch logs file name and serial number. `sanitize_log_input` strips control characters but there is no PHI redaction. Whether the Slack workspace is approved for PHI is `unknown`. | main.py, src/processor.py, src/utils/slack.py | medium |
| 7 | Slack `requests.post(webhook_url, json.dumps(msg))` has no timeout or error handling; a slow webhook can stall the Lambda. | src/utils/slack.py:24 | high |
| 8 | HL7 files and base64 PDFs from outside are parsed with hl7apy and PyMuPDF. Versions are pinned but there is no lockfile with hashes and no dependency/SAST scan in CI. | requirements.txt, bitbucket-pipelines.yml | medium |
| 9 | Four exception types are swallowed in `lambda_handler`, so invalid input succeeds silently with no retry/DLQ from the code. | main.py:133-135 | high |
| 10 | `SUPPORTED_FORMATS = ('hl7')` is a string, so `ext not in SUPPORTED_FORMATS` is a substring test; `h`, `l7` etc. pass and fail later with `InvalidHL7MessageType`. | src/constants.py:1, src/processor.py:41 | high |
| 11 | `get_user_id()` queries `users` with an empty `.only()`, which probably loads all fields including `password`/`reset_token`. | src/database/user.py:7 | low (mongoengine semantics, inferred) |
| 12 | In `post_pipeline_tasks` the billing Lambda, task creation and CardioOne run even when the transaction was aborted for a duplicate ORU, because `database_updates` still returns `patient_id`. | src/processor.py:192-219, main.py:93-103 | medium |

Transport security for MongoDB, S3 and SQS is `unknown` (depends on `DB_URI` and Lambda network config).
