---
repository: patient-billing-schedule
analyzed_commit: ec1d8894c633996d7fc9e7a9423d21521a981bf6
analyzed_branch: main
analyzed_at: 2026-10-05T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [main.py, src/config.py, src/database/connection.py, src/database/query.py, src/database/schedule.py, src/utils/constants.py, src/utils/aws.py, src/utils/slack.py, bitbucket-pipelines.yml, requirements.txt, .gitignore, .vscode/launch-example.json]
---

# patient-billing-schedule: Overview

## Identity (Phase A)

| Item | Value | Status |
|---|---|---|
| Name | `patient-billing-schedule`. The remote is named `patient-schedule-monitoring` (from the onboarding request; no name appears in the code). Deployed artifacts are `qa-`, `uat-` and `prod-patient-bill-schedule.zip` (`bitbucket-pipelines.yml`). The Lambda updates its own records as "Evoke Automated Schedule Monitoring Lambda" (`src/database/query.py` `set_billable_true`) and "AWS LAMBDA BILLING" (`src/database/schedule.py`). | observed |
| Remote URL | `unknown` (the snapshot has no `.git` directory and no README or package metadata; checked repo root) | unknown |
| Local path | `${AISDLC_REPO_PATIENT_BILLING_SCHEDULE}` | observed |
| Base branch / commit | `main` at `ec1d8894c633996d7fc9e7a9423d21521a981bf6` (given by the onboarding request; not verifiable from the snapshot because it has no git metadata) | inferred |
| Type | AWS Lambda function (Python), not a long-running service. Entry `lambda_handler(event, context)` in `main.py`. | observed |
| Language / runtime | Python. Exact Lambda runtime version `unknown` (not declared in the repo; the deploy step only calls `aws lambda update-function-code`). | observed / unknown |
| Libraries | `pymongo` 4.6.3, `boto3` 1.34.88, `requests` 2.31.0, `python-dateutil` (`requirements.txt`). `mongoengine` 0.28.2 is pinned but not imported anywhere under `src/` or `main.py` (grep). `requirements.txt` is UTF-16 encoded. | observed |
| Size | 27 files, about 2,086 lines (`main.py` 323, `src/database/schedule.py` 435, `src/database/query.py` 418, `src/utils/constants.py` 210). No tests, README, Dockerfile or lint config. | observed |
| History | `unknown` (no git metadata in the snapshot) | unknown |

## Purpose (as observed in code)

The Lambda decides, per implanted-device patient, which transmission report should carry each remote-monitoring billing code and when, and writes that result into MongoDB. For each active patient and each active schedule (`day_31`, `day_91`, `day_custom`, `main.py` `get_active_schedules`) it:

1. computes an "ideal billable date" (from signed-report date for accounts anchored on signature, the schedule cutoff date, the last billing date plus the cycle, or implant date plus a wait period; `main.py` `calculate_billing`, constants in `src/utils/constants.py`);
2. computes the ideal billing window around it (`calculate_billing_period`: pre/post day offsets per billing code, summary-report variant for devices flagged `summary_report`, CardioMEMS code 93264, back-billing when the window has passed);
3. finds the matching report in `reports` and flags exactly one billable (`set_billable_true`) while clearing others in the window (`set_billable_false`);
4. advances the patient's `implanted_billing_schedule.*`, `next_send` and `late_date`, sets patients with no report for two years inactive, and marks late patients (`update_schedule`, `prepare_late_tasks_query`);
5. creates follow-up call and letter tasks in `tasks` for late patients and archives them when the patient catches up (`amend_task_records`, `create_task`, `archive_task`);
6. queues a "bot event" on an SQS queue so a manufacturer crawler fetches data for late patients (`send_bot_event_to_sqs`).

Billing codes handled: 93297, 93298 (also with " 26" suffix), 93294, 93295, 0578T, 93264 (`src/utils/constants.py`). Business meaning of codes and windows is not documented in the repo (`unknown`; recorded in `system/` after the developer interview, not here).

## Trigger (observed from handler code)

`lambda_handler` accepts three event shapes (`main.py`):

- direct or API-style `{ "patient_id": ... }` or `{ "body": "<json with patient_id>" }`: processes that one patient;
- SQS-style `{ "Records": [ { "body": "<json with account and/or patient_id>" } ] }`: processes all matching patients of each `account` (`get_all_patients`, excluding account `UCH`) and any listed `patient_id`;
- CLI: `python main.py --patient <id>` (`main.py` `__main__`, `.vscode/launch-example.json`).

What actually invokes the deployed function (EventBridge schedule, SQS event source mapping, API Gateway, another Lambda) is `unknown`: no infrastructure definition is in this repo. The `Records` handling and the SQS FIFO message-group logic in `src/utils/aws.py` suggest an SQS source for per-account runs (inferred). Who publishes those messages is `unknown` here; the sibling `rest-api-evoke` knowledge lists billing-schedule Lambda sends through `services/lambda.js` and `services/sqs.js` (see that package; not re-verified here).

## Deployment (summary)

`bitbucket-pipelines.yml` has one step per branch `lf-qa`, `lf-uat`, `main`: assume an AWS role by Bitbucket OIDC, delete `.gitignore`, the pipeline file and `.git` from the checkout, zip the tree, copy it to an S3 bucket, then `aws lambda update-function-code --publish`. There is no `lf-develop` step and no dependency installation or test step, so third-party packages must come from a Lambda layer or the function's existing environment (`unknown`, see `build-release.md` if written by another analyst). `main` deploys to production.

## Entry points

- `main.py` `lambda_handler` (Lambda handler; configured handler string `unknown`, assumed `main.lambda_handler`).
- `main.py` `__main__` CLI for one patient.

## Provenance notes

- The snapshot has no `.git` directory; commit, branch and history are as stated by the onboarding request and could not be confirmed from files.
- `.env-example` exists but its read was blocked by the environment; environment variable names below come from `src/config.py`. `.env` (gitignored, `.gitignore:53`) is not in the snapshot.

## Unknowns

- Remote URL, git history, release tags.
- Lambda runtime version, handler string, memory, timeout, trigger, IAM role, VPC (no infrastructure in the repo; checked root and `bitbucket-pipelines.yml`).
- How dependencies reach the Lambda (the zip step installs nothing).
- Business definition of billing windows and codes.
