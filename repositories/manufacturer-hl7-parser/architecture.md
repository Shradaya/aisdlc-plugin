---
repository: manufacturer-hl7-parser
analyzed_commit: e185ff36fe03c649cd7e9750e895c8c43f857c43
analyzed_at: 2026-10-01T17:37:23Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [main.py, src/processor.py, src/delay_message_processing.py, src/manufacturer/__init__.py, src/notes/**, src/analytics/**, src/events/**, src/utils/aws.py, src/config.py]
---

# Architecture (Phase C)

Event-driven, single-Lambda pipeline. Claims marked [inferred] are not directly seen in code.

## Data flow

```
Manufacturer adapters (Windows EC2) -> local files -> custom file-sync service   [developer-confirmed, outside this repo]
        |
        v
   S3 bucket (HL7 files) --S3 event--> Lambda main.lambda_handler  <--SQS (S3-shaped body; DLQ and DELAY_SQS)--+
                                              |                                                              |
                                  detect format -> parse ORU_R01 -> duplicate control-id check               |
                                  map account/manufacturer -> device + billing codes                         |
                                  [Abbott ILR non-summary from S3] --> DELAY_SQS ----------------------------+
                                  patient lookup -> billing codes/dates -> manufacturer PDF -> S3 PROCESSED_BUCKET
                                              |
                                  MongoDB transaction: patients, reports (+HF), report_notes,
                                  alert_metadata, patient_analytics, user_activity_logs
                                              |
                          post_pipeline_tasks (4 threads): BENCHMARK_SQS, billing Lambda, new-patient task,
                                              live-call-task delete, CARDIO_ONE_SQS
   errors -> Slack (LF_SLACK_URL / EVOKE_SLACK_URL); failed parse -> S3 <ERROR_PATH><date>/
```

## Entry points and async boundaries

- `lambda_handler` (`main.py:106`) inspects only `Records[0]`. S3 record -> `source="S3"`. SQS record -> JSON body of S3-shaped `Records`, each processed in a loop with `source="SQS"` (one failure aborts the rest). CLI: `main.py:145`.
- The delay path re-publishes `{"Records":[{"s3":{...}}]}` to `DELAY_SQS` (`processor.py:512-530`); the replayed message arrives as `source="SQS"` and is not delayed again (rule requires `S3`). Queue delay/redrive configuration is `unknown` (no IaC). [inferred] The replay carries the already-decoded key and the SQS branch applies `unquote_plus` again, so keys containing `+` or `%` could be double-decoded.
- Post-commit work runs in a 4-worker thread pool (`run_threaded_tasks`) and failures are only logged.

## Modules and boundaries

- `src/processor.py`: orchestration steps. `src/manufacturer/`: per-manufacturer PDF extraction (label and x-coordinate based scraping), HF page splitting, and alert mapping; dispatch by canonical `sending_facility` (Abbott, Biotronik, Medtronic, Boston Scientific). Only Boston (NTE notes) and Biotronik (OBX) produce transmission alerts; Abbott and Medtronic return `{}`. An unknown manufacturer would raise `KeyError` [inferred]. `general.py` is shared helper code.
- `src/notes/`: builds clinical report notes and alert/warning flags per section from DB-configured templates; `ALERT_FLAGS` is module-global state reset after each report.
- `src/analytics/`: appends to `patient_analytics`, which later runs read back.
- `src/events/`: in-process emitter with one listener, `report_inserted` -> `user_activity_logs`.
- `src/database/`: `Mongo` singleton, mongoengine models; see `data-model.md`.
- `src/artanis/`: unreachable at this commit; `get_notes_information_from_images` has no caller and `ARTANIS_AI_LAMBDA` is never set on the Lambda path. If wired in it would invoke the Lambda synchronously (`RequestResponse`, 300 s wait) for configured device types.

## Reliability and failure handling

- Idempotency key: `MSH-10` against `reports.oruControlId`; the check is not atomic with the insert, and the DB duplicate-key path (`oruControlId` in `keyPattern`) is the backstop. HF reports use the `-HF` suffix.
- Transaction conflicts: up to 5 retries with exponential backoff and jitter, sleeping inside the Lambda (`processor.py:210`).
- Exception routing at the handler: see `overview.md`. `upload_File` swallows exceptions, which later surface as `ReportNotFoundException` (analyst finding, not independently verified).
- `database_updates` returns `patient_id` even when the transaction was aborted for a duplicate ORU, so follow-up tasks (billing Lambda, tasks, CardioOne) can run against a patient that was not persisted (`processor.py:192-219`, `main.py:93-103`).
- Mongo reads and the `sequencers` `$inc` run outside the session.

## Auth boundaries

No inbound auth in code. Outbound AWS calls use the Lambda execution role (IAM `unknown`). The application user for writes is the `users` document "EVOKE AUTOMATED NOTES". CI deploys use Bitbucket OIDC.

## Unknowns

Trigger wiring (S3 notification vs SQS event-source mapping, batch size, DLQ settings), delay-queue delay, Lambda timeout/memory/concurrency, why the four production Lambdas exist (per-manufacturer triggers are plausible but unconfirmed), whether a unique index on `reports.oruControlId` exists, timezone of `date.today()` (assumed UTC). Not read in detail: `src/utils/format.py`, most of `noteCreator/*.py`, `obxMapper.py` internals.
