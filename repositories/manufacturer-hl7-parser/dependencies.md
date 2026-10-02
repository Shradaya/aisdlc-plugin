---
repository: manufacturer-hl7-parser
analyzed_commit: e185ff36fe03c649cd7e9750e895c8c43f857c43
analyzed_at: 2026-10-01T17:37:23Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [requirements.txt, src/config.py, src/utils/aws.py, src/processor.py, src/artanis/sender.py, bitbucket-pipelines.yml, .env-example]
---

# Dependencies (Phase D)

## Libraries (`requirements.txt`, all pinned with `==`)

Direct: boto3 1.43.52, botocore 1.43.52, hl7apy 1.3.5, mongoengine 0.29.3, pymongo 4.17.0, pymupdf 1.28.0 (imported as `fitz`), python-dateutil 2.9.0.post0, requests 2.34.2. Transitive: s3transfer 0.19.1, jmespath 1.1.0, urllib3 2.7.0, six 1.17.0, certifi 2026.6.17, charset-normalizer 3.4.9, idna 3.18, dnspython 2.8.0. Versions were not checked against PyPI.

Gaps: `pytest` is used by tests but undeclared; no lockfile, `pyproject.toml` or Dockerfile; Python version undeclared. The pipeline never runs `pip install`, so third-party libraries must come from a Lambda layer or runtime (`unknown`).

## AWS and external services

| Service | Use | Configured by (names only) |
|---|---|---|
| S3 | Read HL7 (bucket/key from event); write PDFs; copy failures to error path | `PROCESSED_BUCKET`, `ERROR_PATH`, `BASE_PATH` (scratch dir) |
| SQS | Delay queue, Benchmark, CardioOne | `DELAY_SQS`, `BENCHMARK_SQS`, `CARDIO_ONE_SQS` |
| Lambda invoke | Billing schedule (async); Artanis AI (sync, unreachable) | `BILLING_LAMBDA_ARN`; `ARTANIS_AI_LAMBDA` (never set on Lambda path) |
| Secrets Manager | Database and Slack configuration | `SM_NAME`, `SM_REGION`; keys `DB_URI`, `DATABASE_NAME`, `SLACK_URL`, `EVOKE_SLACK_URL` |
| MongoDB | Primary data store (shared database, transactions) | `DB_URI`, `DATABASE_NAME` |
| Slack incoming webhooks | Alerts: `LF_SLACK_URL` (development team), `EVOKE_SLACK_URL` (business) | secret keys above |
| CloudWatch | Console link inside Slack messages only; no API call | |

Unknown: IAM role, account, region, trigger wiring (no IaC in repo).

## Downstream targets confirmed in code

| Target | Sent when | Payload |
|---|---|---|
| Billing Lambda | patient id present, env set, and the patient is new or active (`processor.py:600-606`) | async `{"patient_id": "<id>"}` |
| Benchmark SQS | new patient AND account `idtf` AND `export_for_billing` AND env set (`processor.py:591-597`) | `{"eventType":"CREATE_PATIENT","payload":{"patientId":...}}` |
| CardioOne SQS | account has `medical_center_id` (`processor.py:555-588`) | `{"event_type":"FETCH_RHYTHM_ID","payload":{"job_id":"<cardio_one_api_logs _id>"}}`; on failure the job document gets an `error_message` |
| Delay SQS | Abbott ILR non-summary from S3 and env set | `{"Records":[{"s3":{"bucket":{"name":...},"object":{"key":...}}}]}` |
| Slack | errors and notices | POST `{"text": ...}` |

`eventType` (Benchmark) vs `event_type` (CardioOne) spelling differs. Which Slack webhook receives which message: `EVOKE_SLACK_URL` gets report-not-found, missing patient name and duplicate-patient notices (the last two fall back to `LF_SLACK_URL`); `LF_SLACK_URL` gets errors, account-not-found, unidentified device model and patient-not-matching.

## Developer-confirmed system relationships

Recorded in `system/repository-relationships.yaml` (status `human-confirmed`): upstream adapters and sync service (not onboarded), billing Lambda, Benchmark SQS consumer, CardioOne SQS consumer. The Artanis AI Lambda was not confirmed and is dead code at this commit. Owners and repository names of the counterparts remain `unknown` unless stated there.

## Production Lambda targets in the pipeline

Name variables: `ABBOT_LAMBDA_NAME` (sic), `BOSTON_LAMBDA_NAME`, `MDT_LAMBDA_NAME`, `BIOT_LAMBDA_NAME`, all receiving the same zip (`bitbucket-pipelines.yml:101-108`).

## Config quirks

`.env-example` uses `region_name`, `SecretId`, `BILLING_LAMBDA`, which differ from the Lambda names (`SM_REGION`, `SM_NAME`, `BILLING_LAMBDA_ARN`); it lacks `DELAY_SQS`/`ARTANIS_AI_LAMBDA`.
