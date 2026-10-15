---
repository: patient-billing-schedule
analyzed_commit: dea0eff5ed6fd7d5a9ee734cd132862a27a4fb31
analyzed_branch: main
analyzed_at: 2026-10-15T08:45:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [main.py, src/config.py, src/database/connection.py, src/database/query.py, src/database/schedule.py, src/utils/slack.py, src/utils/aws.py, src/events/billing_activity_logger.py, bitbucket-pipelines.yml, requirements.txt, requirements-dev.txt, tests/conftest.py, .gitignore]
refresh_note: Refreshed from ec1d8894 to dea0eff. Touched: Authorization (new bulk writes), Validation, PHI/logging (bot events), Dependency notes (dev pins, tests), Findings 2 and 5.
---

# Security baseline (Phase I)

Names only; no secret values. The repository is a Python AWS Lambda with no HTTP surface of its own (`main.py` `lambda_handler`, plus a CLI). Written by the onboarding orchestrator after the repository-analyst's write was refused; all statements below were re-checked against the `main` snapshot at the analyzed commit.

## Authentication
- No inbound authentication in code: `lambda_handler(event, context)` trusts its event (`main.py`). Access control is whoever may invoke or send to the function, which is configured outside the repository (`unknown`: invoke permissions, queue policy, any API Gateway authorizer).
- Outbound: the function reaches MongoDB with a connection string from Secrets Manager (`DB_URI`, `DATABASE_NAME`), AWS APIs through the Lambda execution role (boto3 default chain), and Slack through a webhook URL (`LF_SLACK_URL`). All three are read in `src/config.py`.

## Authorization
- None in code. The function reads and writes patient data of any account supplied in the event; the only filter is the hard-coded account exclusion `UCH` in the account query (`src/database/query.py`). The execution role and database user privileges are `unknown` (not in the repository).
- Writes are made under the actor user "EVOKE AUTOMATED NOTES" looked up in `users` (`src/database/user.py`). If that user is missing the lookup returns an empty string and the new per-task audit entries in `user_activity_logs` are skipped while the `live_call_tasks` archive still happens (`src/database/schedule.py` `archive_live_call_tasks`, `src/events/billing_activity_logger.py`); the `billing_activity_logger` entry is still written (observed).
- New bulk-write surface (EL-5610): on 730-day deactivation the Lambda sets all of the patient's non-archived `live_call_tasks` to `archived` (`src/database/query.py`). The destructive helper `Mongo.delete_many` also exists but is not called anywhere in `src/` or `main.py` (grep); it refuses an empty filter (`ValueError`), which guards against whole-collection deletes (`src/database/connection.py`, covered by `tests/test_connection_delete_many.py`). Any future caller gets unrestricted delete by filter.

## Transport and headers
- No server. `requests.post(ENV_VARS.LF_SLACK_URL, ...)` in `src/utils/slack.py` uses the library default TLS verification and passes no `timeout`, so a hung Slack call can hold the invocation until the Lambda timeout (observed).
- MongoDB TLS depends on the connection string (`unknown`).

## Validation and sanitization
- `patient_id` and `account` values from the event are passed into queries and converted with `ObjectId` without schema validation (`main.py`, `src/database/query.py`); a malformed id raises, is logged, and is swallowed by the top-level `try/except` (observed, `main.py`).
- `archive_live_call_tasks_by_patient_id` rejects `None` or empty ids and converts with `ObjectId` (a malformed id raises); the patient id comes from the database document, not from the event (`src/database/schedule.py`).
- Queries are built as Python dicts for pymongo, not strings; no `$where` or operator injection from event input was found, but event values are used as filter values unvalidated (observed).

## Secrets and configuration (names only)
- From Secrets Manager (secret id from env `SM_NAME`, region from `SM_REGION`): `DB_URI`, `DATABASE_NAME`, `LF_SLACK_URL`, `EVOKE_SLACK_URL`, `MANUFACTURER_BOT_SQS_URL` (`src/config.py`).
- Local run: `.env` file parsed line by line (`KEY=VALUE`, split on `=`, so values containing `=` break). `.env` is in `.gitignore`; `.env-example` exists (contents not read: access to env-style files is denied by the analysis tooling).
- CI variable names (values `unknown`): `AWS_REGION`, role ARN variables per environment, `QA_LAMBDA_NAME`, `UAT_LAMBDA_NAME`, `PROD_LAMBDA_NAME`, `DEV_LAMBDA_RESOURCE_BUCKET`, `PROD_LAMBDA_RESOURCE_BUCKET` (`bitbucket-pipelines.yml`).

## Cryptography
- None implemented in the repository. No hashing, signing or encryption code.

## PHI in logs and external channels
- Task descriptions written to the `tasks` collection contain patient name, date of birth and two phone numbers (`src/database/query.py` `create_task`). This duplicates PHI into task documents (observed); who can read `tasks` is outside this repository.
- Bot events (EL-5444) carry only patient ids, manufacturer, account and a fixed `source` string in the SQS body; the patient document is reduced in memory to `_id`, `name`, `manufacturer`, `account`, `next_send` (`BOT_EVENT_PATIENT_KEYS`), and `name` is written to `manufacturer_crawler_report_status` on failure or skip (observed). SQS send failures are logged with manufacturer, account and the list of patient ids via `log.error`, not the payload body or queue URL (`src/database/schedule.py` `flush_bot_events`).
- Logs are plain `log.info` lines. The billing-period dict is logged per schedule (`main.py`: `log.info(period_value)`) and includes device information; patient and document ids are logged (`Processing <patient id> of <account>`). Patient names and phone numbers are not logged by this code (observed by reading the logging calls).
- Slack error messages contain the device serial number and the exception text (`main.py` returns `"<serial> <---> <exception>"`, sent by `src/utils/slack.py` inside a code block with a CloudWatch log link). Exception text can include document ids or query fragments; PHI content `unknown`.

## File uploads
- None.

## Dependency notes
- New `requirements-dev.txt` pins `pytest==9.1.1`, `mongomock==4.3.0` and the runtime packages; it is not used by the pipeline. `tests/conftest.py` replaces `src.config` and the Mongo client with dummy non-routable values (`*.invalid` hosts), so tests need no real secrets or network (observed; values not reproduced).
- `requirements.txt` is UTF-16 with a BOM; pins include `boto3==1.34.88`, `pymongo==4.6.3`, `requests==2.31.0`, `urllib3==2.2.1`, `mongoengine==0.28.2` (unused: never imported). Vulnerability status of these pins was not checked against an advisory database (`unknown`).
- The deployment pipeline never installs `requirements.txt`; how dependencies reach the Lambda (layer or base image) is `unknown`.

## Findings (follow-ups)
1. **OIDC token file is zipped into the deployment artifact (observed from script order).** In every branch step, `bitbucket-pipelines.yml` writes the Bitbucket OIDC token to `web-identity-token` in the working directory and then runs `zip -r $ZIP_NAME .`; the file is never removed first, so it is in the zip uploaded to S3 and deployed. The token is short-lived, but it is a credential in an artifact. The built artifact itself was not inspected.
2. **Production deploy on push to `main` with no tests, install or approval step** (tests now exist under `tests/` but `bitbucket-pipelines.yml` still has no test step: grep for "pytest" found nothing) (`bitbucket-pipelines.yml`, `main` branch). `lf-qa` and `lf-uat` deploy the same way. QA and UAT upload to the bucket variable named for development (`DEV_LAMBDA_RESOURCE_BUCKET`).
3. **PHI copied into `tasks` descriptions** (see above).
4. **Unvalidated event input and an open trust boundary** (see Authentication and Validation).
5. **Errors are swallowed: the handler always returns success** (the new `finally` flush of bot events also swallows and only logs failures, `main.py`) and the SQS batch is never retried or sent to a DLQ on failure (`main.py`); Slack is the only failure signal and only fires when `context` is not `None`.
6. **No request timeout on the Slack call** (`src/utils/slack.py`).
7. **`print(requests.post(...))` writes the HTTP response object to the log** (`src/utils/slack.py`); the webhook URL itself is not printed.

## Unknowns
- Lambda execution role permissions, VPC, resource policy, who can invoke or send messages.
- MongoDB user privileges, TLS and network exposure.
- Whether the shared secret also holds credentials unrelated to this function (the whole secret is read).
- Advisory status of pinned dependencies.
- `.env-example` contents.
