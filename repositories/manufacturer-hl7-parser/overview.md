---
repository: manufacturer-hl7-parser
analyzed_commit: 55bae1b09c246af044531301560276ec7f3ab3a2
analyzed_branch: main
analyzed_at: 2026-10-15T08:31:52Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [main.py, src/processor.py, src/config.py, src/delay_message_processing.py, bitbucket-pipelines.yml, requirements.txt, readme.md]
---

# manufacturer-hl7-parser: Overview

## Identity (Phase A)

| Item | Value | Status |
|---|---|---|
| Name | manufacturer-hl7-parser ("Evoke Manufacturer Data Pipeline", `readme.md:1`) | observed |
| Remote | `git@bitbucket.org:evoke-medical-care/manufacturer-hl7-parser.git` | observed |
| Local path | `${AISDLC_REPOS_ROOT}/manufacturer-hl7-parser` (resolved from `claude.env`) | observed |
| Base branch | `main` (`origin/main` at `55bae1b`; the local checkout was at `0bc85fd`, two commits behind) | observed |
| Analyzed commit | `55bae1b09c246af044531301560276ec7f3ab3a2` ("Merged in EL-5602 (pull request #1369)", 2026-10-15T01:52:40Z); onboarded at `e185ff3` (EL-5477, 2026-10-01) | observed |
| Type | Event-driven Python AWS Lambda pipeline (no HTTP surface) | observed |
| Language | Python; 3.10+ implied by `X \| None` annotations (`src/processor.py:555`); exact Lambda runtime `unknown` (no IaC, Dockerfile or runtime file checked) | inferred |
| Size | 152 tracked files at the analyzed commit | observed |

Onboarding analysis was made from an exact `git archive` snapshot of `main@e185ff3`; the 2026-10-15 refresh read `origin/main` through read-only git (`diff`, `show`), covering the two merged PRs EL-5617 and EL-5602. The developer's checkout was on branch `lf-uat` at onboarding time and was not read.

## Purpose (as observed in code)

Receives cardiac implantable-device remote-monitoring transmissions as HL7 `ORU^R01` files from four manufacturers (Abbott, Biotronik, Boston Scientific, Medtronic), parses them, and for each transmission: finds or creates the patient, extracts the manufacturer's PDF report, derives billing codes and next-billing/send dates, auto-generates clinical report notes and alert flags, and writes patient, report, notes and analytics records to MongoDB in one transaction. Then triggers follow-up work (billing schedule Lambda, Benchmark and CardioOne queues, new-patient task creation). Errors are reported to Slack.

Role in the wider system is confirmed by the developer in `system/repository-relationships.yaml` and `system/architecture/system-overview.md`.

## Entry points

- `main.py:106` `lambda_handler(event, context)`: reads `Records[0]`.
  - S3 event record: processed with `source="S3"`.
  - SQS record whose `body` (JSON string or dict) holds S3-shaped `Records`: each inner record processed with `source="SQS"`.
  - Anything else raises `Unknown event record format`.
- `main.py:26` `process(hl7_bucket, key, context, source)`: the pipeline.
- `main.py:145` CLI `python main.py --path <file.hl7>`: builds a fake S3 event with an empty bucket name; needs a local `.env` (`readme.md:41-46`).
- `.vscode/launch-example.json`: example debug configuration.

## Pipeline order (`main.process`, `main.py:26-103`)

1. Detect format from file extension, then load the message (S3 or local file).
2. Parse HL7 and require message type `ORU_R01`; check `MSH-10` control id against `reports.oruControlId` (duplicate = skip). Any failure here copies the file to `<ERROR_PATH><date>/` and re-raises.
3. Map account and manufacturer names (Slack alert if the account is not in the database).
4. Validate and format dates; look up device model and billing codes.
5. Delay decision (see below).
6. Look up the patient (serial number, else name + DOB which marks a generation change); validate that the device model matches the stored patient.
7. Abort quietly with a Slack alert if a new patient has no name.
8. Map billing codes (IDTF vs invoice), map transmission alerts, compute billing and send dates.
9. Create the report PDF (manufacturer-specific) and upload to the processed bucket; confirm a report PDF exists.
10. `database_updates`: one MongoDB transaction (patient upsert, notes, report insert, HF report insert when applicable, report notes, analytics), retried up to 5 times on transaction conflicts.
11. Record delayed-message bookkeeping, then `post_pipeline_tasks` (threaded, failures only logged).

## Delay rule (`src/delay_message_processing.py:21-37`)

Abbott + device type `ILR` + non-summary report + source `S3` is re-published to `DELAY_SQS` (only if that variable is set) and not processed in that invocation. Arrivals of Abbott ILR messages from any source are recorded in `delayed_messages`. The purpose of the delay is `unknown` (an Abbott summary report arriving first is a plausible but unconfirmed reason).

## Error handling at the handler (`main.py:128-143`)

| Exception | Behavior |
|---|---|
| `ParsingMessageException`, `InvalidHL7MessageType` | Slack alert, swallowed (invocation succeeds) |
| `ReportNotFoundException`, `DuplicateControlIDException`, `PatientDeviceNotMatchingException`, `DeviceNotInDB` | swallowed silently (some alert earlier in the pipeline) |
| anything else (including `IntialReportTabNotSet`, `RetryLimitException`, `UnknownException`) | Slack alert with traceback, then re-raised |
| always | `empty_directory()` in `finally` |

Because the swallowed cases succeed, a failed message is not retried and does not reach a DLQ from the code's side.

## Integrations (names only)

S3 (input bucket from event, `ERROR_PATH`, `PROCESSED_BUCKET`), MongoDB (`DB_URI`, `DATABASE_NAME` from Secrets Manager `SM_NAME`/`SM_REGION`), SQS (`DELAY_SQS`, `BENCHMARK_SQS`, `CARDIO_ONE_SQS`), Lambda invoke (`BILLING_LAMBDA_ARN`), Slack webhooks (`SLACK_URL` loaded as `LF_SLACK_URL`, `EVOKE_SLACK_URL`). Details: `dependencies.md`, `interfaces.md`.

`src/artanis/sender.py` invokes an `ARTANIS_AI_LAMBDA`, but `get_notes_information_from_images` has no caller and the variable is never set by `src/config.py`: dead code at this commit (observed; the developer did not select it as an active connection).

## Deployment

`bitbucket-pipelines.yml`: branch pushes to `lf-develop`, `lf-qa`, `lf-uat` and `main` zip the source and update Lambda code. `main` updates four production Lambdas (Abbott, Boston, Medtronic, Biotronik name variables). No test step. See `build-release.md`.

## Unknowns

- Lambda runtime, memory, timeout, triggers, DLQ and IAM (not in the repository). Checked: repo root, `bitbucket-pipelines.yml`, `readme.md`.
- Commit-message and PR conventions of this repository (snapshot has no `.git`). Recent merges are named `EL-<n>` (e.g. `EL-5477`) per `git log` subject lines.
