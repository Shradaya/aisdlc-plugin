---
repository: manufacturer-crawler
analyzed_commit: d6aa388a03c12e777846a704818ba5903a021a4f
analyzed_branch: main
analyzed_at: 2026-10-15T08:55:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [database/db_secret.py, database/connection.py, utils/secretString.py, utils/config.py, utils/slack.py, utils/exportToS3.py, utils/accounts.py, main.py, eventHandler/disconnected_monitors.py, eventHandler/event_schema.py, manufacturer/Abbott_Merlin/abbott.py, manufacturer/Abbott_Merlin/utils.py, manufacturer/Biotronik/biotronik.py, manufacturer/Medtronic_Carelink/trackAlert.py, Dockerfile, bitbucket-pipelines.yml, requirements.txt, .dockerignore, .gitignore]
---

# manufacturer-crawler: Security baseline (Phase I)

Names only; no secret values were read or are recorded. `.env.example` and any `.env` were deliberately not read.

## Authentication to manufacturer portals

- Credentials source: the MongoDB collection `manufacturer_accounts` (`database/db_secret.py` `getSecret`, default `collection_name="manufacturer_accounts"`). `process_event` queries `isActive: true` documents for the requested manufacturers and optional `account`, then passes the decoded documents (with `username`, `password`) to the crawlers (`main.py`).
- Password storage: each `password` field is a JWT (HS256) whose `data` claim is hex AES-CBC ciphertext (IV is the first block); `decodePassword` splits Secrets Manager key `BOT_SECRET_KEY_PROD` into an AES key and a JWT secret (comma separated) and decrypts in memory (`database/db_secret.py`). Observations: the key name says `PROD` and is used in every environment (no environment switch, observed); AES-CBC is unauthenticated, but the JWT signature covers the ciphertext (inferred acceptable); all passwords of all matching accounts are decrypted up front for every event, even for a single-patient trigger (observed, `getSecret` with an empty extra filter beyond `isActive` and manufacturer).
- Login: Selenium types username and password into the portal login forms (`Abbott_Merlin/abbott.py`, `Biotronik/biotronik.py`, and per-manufacturer equivalents). Logs say "Username entered for <account>." and "Password entered for <account>." (account label, not values).
- Expired or wrong credentials: the crawler halts the account (`setAccountsAsHalted` sets `isActive false`, `schedule false`, `haltInfo`) and posts to the webhook `SLACK_URL_PASSWORD_EXPIRED` with manufacturer, account and username (`manufacturer/*/utils.py`, `Boston_Scientific/boston.py`). Usernames therefore appear in Slack (not passwords).
- Session hygiene: cookies cleared between SQS records and after each account (`reset_browser`, `main.py`); Chrome profile dirs are temp dirs removed in `finally`.
- Local runs: `LOCAL_EXECUTION` uses locally installed Chrome and `webdriver_manager` (downloads a driver at run time, local only).

## Secret handling

| Item | Source | Evidence |
|---|---|---|
| App secret JSON | AWS Secrets Manager, id from env `SM_NAME`, region from `SM_REGION`, loaded at import. Keys used by name: `DATABASE_NAME`, `DB_URI`, `BOT_SECRET_KEY_PROD`, `SLACK_URL`, `SLACK_URL_NOSHOW`, `SLACK_URL_PASSWORD_EXPIRED`, `ERROR_SLACK_URL`, `BOT_CHANNEL_ID`, `EVOKE_ALERT_TOKEN` | `utils/secretString.py`, `utils/config.py` |
| Environment variables (names) | `SM_NAME`, `SM_REGION`, `PROCESSED_BUCKET`, `S3_NOSHOW_KEY_PREFIX`, `SLACK_URL` (overrides the secret for the default channel), `LOG_LEVEL`, `LOCAL_EXECUTION`, `CHROME_BINARY_LOCATION_PATH`, `SELENIUM_SERVICE_EXECUTABLE_PATH`, `AWS_BATCH_JOB_ID` (read only for a message) | `utils/secretString.py`, `utils/logger.py`, `main.py`, `eventHandler/disconnected_monitors.py` |
| Pipeline variables (names) | `AWS_REGION`, `AWS_ROLE_ARN`, `MANUFACTURE_BOT_ECR_REGISTRY`, `MANUFACTURE_BOT_IMAGE`, `MANUFACTURE_BOT_LAMBDA`, `EVENTBRIDGE_BOT_LAMBDA`, `BITBUCKET_STEP_OIDC_TOKEN` (set by Bitbucket) | `bitbucket-pipelines.yml` |

Findings:
- If Secrets Manager fails, `get_secret` logs and returns an empty dict; `process_event` then reports "Unable to load secrets" and returns (observed). The database URI never appears in logs (checked `database/connection.py`; the error path logs the exception text, which could include the URI in some pymongo errors: `unknown`).
- `.gitignore` ignores `.env`, `.venv`; `.dockerignore` excludes `.env` and `.env.example` from the image. README suggests exporting secrets into `~/Documents/secret_manager.txt` locally (README "Export secrets locally"), which writes decrypted secret JSON to an unprotected file: documented practice, a hygiene risk.
- Slack webhook URLs and `EVOKE_ALERT_TOKEN` are secrets held in the secret JSON; `slack_post_snapshot` uses a bot token to upload a screenshot (`utils/slack.py`; the function has no caller found in this snapshot, so screenshots reach Slack only if called elsewhere: `unknown`).

## PHI exposure in logs, Slack and S3

Patient data handled here: names, dates of birth, device serial numbers, transmission data (PHI by nature). Observed controls and gaps:

- Slack notifications mostly use `evoke_id` and patient `_id` rather than names (`Abbott_Merlin/patient_crawler.py`, `Biotronik/biotronik.py`, Medtronic `transmission_crawler.py`). Gaps: the Biotronik mismatch message includes the portal patient name and the profile name (`biotronik.py`, "Patient name mismatched"); the Medtronic transmission crawler builds `finalized_patients_name` entries as `"<patient_name> [before-->after]"` (`Medtronic_Carelink/transmission_crawler.py`, consumed by `database/export.py` `exportFinalizedPatientsToDB`); whether those names reach Slack or only the database was not traced (unknown); error text from Selenium or pymongo exceptions is sent verbatim (`generateErrorMsgWithException`), and can embed page text or filter values (unknown extent).
- `main.py` `lambda_handler` runs `print("EVENT RECEIVED: ", event)`, so each event is written to CloudWatch; events carry patient ids and account names (ids, not names) and the Slack "RESPONSE" message includes the ack text.
- `noshow_disconnected_logs.event` stores the whole input event and `failed_reason` stores the Lambda public IP (from `https://api.ipify.org`, an external call per account, `eventHandler/disconnected_monitors.py`).
- S3: disconnected-monitor JSON (patient-level data from the portals) under `${S3_NOSHOW_KEY_PREFIX}/...` in `PROCESSED_BUCKET`; portal screenshots (`/tmp/snapshot.png`) uploaded on errors to `manufacturer-bot-crawler/screenshots/...`. Screenshots can show patient names, DOBs and serials. Bucket policy, encryption and retention: `unknown` (no IaC here). The screenshot file name is fixed, so concurrent use in one container is not an issue, but a stale screenshot from an earlier error can be uploaded for a later one if the later error has no new screenshot (inferred).
- Log level is `INFO` by default (`utils/logger.py`); logs print portal account labels and patient ids, not names, in the paths read (`logging.info` grep). No log scrubbing exists.

## Browser hardening

- Chrome flags in `create_chrome_driver` (`main.py`): `--no-sandbox` (always, both local and Lambda), `--headless`, `--single-process`, `--no-zygote`, `--disable-dev-shm-usage`, `--disable-dev-tools`, `--disable-gpu`, `--remote-debugging-port=9222` (set in every mode, also the Lambda one). `--no-sandbox` is the common requirement in Lambda but removes Chrome's sandbox; combined with an old Chrome the exposure to hostile portal content is higher (observed, the portals are trusted third parties).
- Chrome is an old Chromium snapshot (build 1135561, about Chrome 114, 2023) and chromedriver 114.0.5735.90, downloaded over HTTPS from `googleapis.com` and `chromedriver.storage.googleapis.com` with no checksum or signature check and no pin of a hash (`Dockerfile`). This browser carries unpatched vulnerabilities (inferred from the version age); the `chromedriver.storage.googleapis.com` host is the deprecated pre-115 download location (unverified whether it still serves).

## Dependencies

- `requirements.txt` pins every package with `==` including transitive ones (38 lines), which is good for reproducibility; no hashes (`--require-hashes` not used) and no lockfile tool. Versions are far newer than the browser (selenium 4.47.0 with a Chrome 114 driver: compatibility unverified).
- `webdriver-manager` 4.1.2 and `python-dotenv` are listed; `python-dotenv` import not found in the code read (unknown whether used).
- No dependency scanning is configured in the repo (no Dependabot or similar; SonarCloud only via `sonar-project.properties`, which has `sonar.sources=.` and a project key naming `manufacturer-hl7-parser`).
- Base image `public.ecr.aws/lambda/python:3.14` is unpinned to a digest; `dnf install` packages are unpinned.

## Input validation

- Event payloads are validated by pydantic (`eventHandler/event_schema.py`): event type literal, non-empty `value` and `patient_ids`, manufacturer within the four allowed names, account non-empty, `account_type` in NXT or CLARITY. `extra="allow"` keeps unknown fields. Patient ids are converted with `ObjectId(...)`, which raises on invalid ids (handled by the SQS loop as a failed record).
- Authorization of the caller: none inside the Lambda; any principal permitted to invoke the function or send to its queue can trigger crawls (IAM and queue policies: `unknown`).

## IAM and infrastructure unknowns

- Lambda execution role permissions (Secrets Manager read, S3 put on `PROCESSED_BUCKET`, SQS receive, VPC and egress): `unknown`; no IaC. Code needs at least `secretsmanager:GetSecretValue` on `SM_NAME`, `s3:PutObject`, and network access to MongoDB, Slack, the four portals, `api.ipify.org` and Secrets Manager.
- MongoDB user rights, TLS and network allowlisting (portals may allow-list the Lambda's egress IP; the public IP lookup suggests that): `unknown`.
- ECR repository policy and image scanning: `unknown`.

## Pipeline OIDC token handling

`bitbucket-pipelines.yml`, branch `main` only, step `oidc: true`, deployment `Production`, 15 min limit:
- The step writes `$BITBUCKET_STEP_OIDC_TOKEN` to `./web-identity-token` in the build workspace and exports `AWS_WEB_IDENTITY_TOKEN_FILE` and `AWS_ROLE_ARN` for the AWS CLI (OIDC web identity, no long-lived AWS keys in the file). The token file is written into the repository working directory, not removed afterwards, and is not in `.gitignore` or `.dockerignore`. `docker build` runs with `.` as context after the file is written, so the token file would be copied into the image by `COPY . ${LAMBDA_TASK_ROOT}` (`Dockerfile` copies everything not excluded; `.dockerignore` does not list `web-identity-token`). The token is short-lived (Bitbucket limits), but it lands in an image pushed to ECR and into the Lambda package: observed from the three files; the exact token lifetime and whether it is still valid after the step: `unknown`.
- `echo $BITBUCKET_STEP_OIDC_TOKEN > ...` is not printed to the log (redirected), but the script echoes with `$(pwd)`; shell tracing is not enabled (no `set -x`) (observed).
- The image tag is always `latest` (`ENVIRONMENT="latest"`), pushed and deployed straight to the Lambda(s) with no staging gate; the deployment environment is named Production. The build image `public.ecr.aws/c7j4d3u2/build-agent-image:latest` is a mutable external image, unpinned.
- Two Lambda functions are updated with the same image (`MANUFACTURE_BOT_LAMBDA`, `EVENTBRIDGE_BOT_LAMBDA`); nothing waits for the update to finish or checks health.
- No test, lint or security scan step precedes deploy (observed).

## Notable findings (summary)

1. OIDC token file likely baked into the Lambda image (`bitbucket-pipelines.yml` writes it in the build context; `.dockerignore` lacks it).
2. Chromium 114-era browser with `--no-sandbox` and no integrity check on the downloads.
3. Portal credentials decrypted for all active accounts on every event; the decryption key is named `BOT_SECRET_KEY_PROD` for every environment.
4. Portal screenshots and disconnected-monitor JSON (PHI) written to S3; some Slack and error paths carry patient names or raw exception text.
5. Whole input events are printed to CloudWatch (`print("EVENT RECEIVED: ", event)`).
