---
repository: manufacturer-hl7-parser
analyzed_commit: e185ff36fe03c649cd7e9750e895c8c43f857c43
analyzed_at: 2026-10-01T17:37:23Z
generator: aisdlc@1.0.0
status: inferred
confidence: medium
evidence: [src/processor.py, src/database/models/**, src/database/query.py, src/utils/aws.py, bitbucket-pipelines.yml, src/constants.py]
---

# Change-impact map (Phase K)

Consumers outside this repository are not visible in code; "who is affected" below is `unknown` unless the developer confirmed it in `system/repository-relationships.yaml`.

## What breaks if X changes

| Area changed | Affected | Notes |
|---|---|---|
| Shared Mongo collections: `patients`, `reports`, `report_notes`, `alert_metadata`, `patient_analytics`, `accounts`, `devices`, `device_types`, `manufacturers`, `tasks`, `live_call_tasks`, `cardio_one_api_logs`, `delayed_messages` | Every other application using the same database (consumers `unknown`; see relationships) | Field renames/removals or type changes need cross-repository review. `reports.oruControlId` and its `-HF` suffix, and `reports.hl7_file_path`, are relied on by duplicate detection and probably by other code. |
| SQS message shapes | Benchmark consumer (`eventType`, camelCase), CardioOne consumer (`event_type`, snake_case), this Lambda itself for `DELAY_SQS` | Delay-queue body must stay S3-notification shaped because `lambda_handler` re-parses it. |
| Billing Lambda payload `{"patient_id"}` | Billing schedule Lambda | |
| S3 layouts: `<manufacturer>/<clinic>/<date>/<report>.pdf`, `<ERROR_PATH><date>/` | Whatever reads PDFs through `reports.file_path` / `hf_file_path` and operators who triage error files | Paths are persisted on report documents. |
| Env vars / secret keys (`DELAY_SQS`, `BENCHMARK_SQS`, `CARDIO_ONE_SQS`, `BILLING_LAMBDA_ARN`) | Feature silently disabled when unset (guards skip sending) | Removing one is not an error. |
| Inbound event shape (`Records[0]`, SQS body) | Upstream sync service, S3 notifications, DLQ redrive | |
| Pinned dependencies (`hl7apy`, `pymupdf`, `mongoengine`, `pymongo`) | Parsing, PDF scraping, ODM/transactions | No lockfile; Lambda layer/runtime provenance `unknown`. |

## Highest-risk areas

1. `processor.database_updates` and its retry/duplicate logic (transaction scope, aborted-but-continues behavior, see `architecture.md`).
2. `src/manufacturer/*` PDF scrapers: hard-coded vendor labels and x-coordinates; a manufacturer report-layout change breaks extraction (surfaces as `ReportNotFoundException`, swallowed).
3. Billing-code mapping: `src/utils/billingCompatibility.py`, `src/constants.py` (`STRIP_MODIFIER_MAPPER`, `OLD_TO_NEW_MAPPER`), IDTF/invoice/split logic in `update_billing_codes`, next-bill date calculation in `src/utils/date.py`.
4. Notes and alert flags (`src/notes/**`): module-global `ALERT_FLAGS`, DB-driven templates.
5. Delay rules plus `lambda_handler` parsing of SQS records.
6. One zip deployed to four production Lambdas on every push to `main`, with no tests in CI.

## Test coverage near each area

Only unit tests exist (see `testing.md`). No tests for `hl7/`, `pdf/`, `src/manufacturer/*`, `main.py` or most of `processor.py`; changes there need manual evidence.

## Known defects worth fixing in passing (observed; see `security.md`)

`SUPPORTED_FORMATS` string, `empty_directory` with unset `BASE_PATH`, regex without escape, Slack call without timeout, OIDC token file in the deploy zip.
