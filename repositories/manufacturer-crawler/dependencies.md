---
repository: manufacturer-crawler
analyzed_commit: d6aa388a03c12e777846a704818ba5903a021a4f
analyzed_branch: main
analyzed_at: 2026-10-15T08:55:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [requirements.txt, Dockerfile, bitbucket-pipelines.yml, constants.py, main.py, utils/config.py, utils/secretString.py, utils/slack.py, utils/exportToS3.py, utils/accounts.py, database/connection.py, database/db_secret.py, database/export.py, database/insertDocument.py, database/updateDocument.py, eventHandler/*.py, manufacturer/**/*.py, README.md]
---

# Dependencies (Phase D)

Repository location: `${AISDLC_REPOS_ROOT}/manufacturer-crawler`. Source read from an exact `git archive` of origin/main at d6aa388 (not the developer checkout). `.env.example` and `.env` were deliberately not read; environment variable names below come from code only. Confidence is medium because only static reading was done: nothing was executed, and IaC (queue, EventBridge, IAM, Lambda config) is not in this repo.

## Runtime and packaging

| Item | Value | Classification | Evidence |
|---|---|---|---|
| Language/runtime | Python 3.14 on AWS Lambda container image `public.ecr.aws/lambda/python:3.14` | runtime-only | Dockerfile:1 |
| Handler | `main.lambda_handler` | n/a | Dockerfile CMD |
| Browser | Chromium snapshot build 1135561 (Linux_x64, from `googleapis.com/.../chromium-browser-snapshots`), unzipped to `/opt/chrome-linux/chrome` | runtime-only | Dockerfile:10-14, main.py:70 |
| Driver | chromedriver 114.0.5735.90 from `chromedriver.storage.googleapis.com`, unzipped to `/opt/chromedriver` | runtime-only | Dockerfile:9, main.py:69 |
| OS libs | atk, cups-libs, gtk3, libX*, alsa-lib, pango, Xvfb, dbus-glib etc. via `dnf` (unpinned) | build-only | Dockerfile:3-6 |
| CI/CD | Bitbucket Pipelines on `main` only: docker build, push to ECR, `aws lambda update-function-code` for two functions (`$MANUFACTURE_BOT_LAMBDA`, `$EVENTBRIDGE_BOT_LAMBDA`, same image tag `latest`) | build-only | bitbucket-pipelines.yml |
| Tests | no test directory, no test dependencies. `sonar-project.properties` exists (not read for gates) | test-only: none | file listing |

### Version risks (observed)

1. Chromium (snapshot 1135561, about Chrome 114) and chromedriver 114.0.5735.90 are pinned and consistent with each other, but `selenium==4.47.0` is a much newer 4.x client. Selenium 4.6+ ships Selenium Manager, which is bypassed because `Service("/opt/chromedriver")` is given an explicit path (main.py:69), so there is no automatic mismatch repair. Selenium 4.47 against a Chrome 114 era driver (W3C protocol) is likely to work for basic commands, but newer CDP/BiDi features would not. Compatibility not verified (`unknown`).
2. `chromedriver.storage.googleapis.com` stopped publishing after Chrome 114 and the Chromium snapshot bucket is a third-party-style download. A rebuild depends on both URLs remaining available; no checksum verification (Dockerfile:9-10). Inferred risk, not tested.
3. Chrome 114 is years out of date, a security and portal-compatibility risk (manufacturer sites may drop support). Inferred.
4. Python 3.14 with the pinned wheels (pydantic 2.13.4, pydantic_core 2.46.4, cffi 2.1.1, pycryptodome 3.23.0): availability of 3.14 wheels was not verified. `unknown`.
5. Headless flags `--single-process`, `--no-zygote`, `--no-sandbox` are Lambda workarounds (main.py:71-77); crash recovery code recreates the driver on `WebDriverException`.
6. Local mode (`LOCAL_EXECUTION` true) imports `webdriver_manager` lazily (main.py:60). `webdriver-manager` is still installed in the image.
7. All requirements are fully pinned (including transitive dependencies; flat list, no lock file or hash pinning). Dependabot or audit tooling: `unknown` (none seen).

## Python packages (requirements.txt, exact pins)

Direct (imported by repo code):

| Package | Pin | Purpose | Class | Evidence |
|---|---|---|---|---|
| selenium | 4.47.0 | Browser automation of manufacturer portals | direct | main.py:1, manufacturer/** |
| webdriver-manager | 4.1.2 | Local-run driver download only | direct (local only) | main.py:60 |
| pymongo | 4.17.0 | MongoDB client; also provides `bson.ObjectId` | direct | database/connection.py, eventHandler/*.py |
| boto3 | 1.43.68 | S3 uploads, Secrets Manager | direct | utils/secretString.py, utils/exportToS3.py |
| botocore / s3transfer | 1.43.68 / 0.19.2 | boto3 internals | indirect | requirements.txt |
| pydantic | 2.13.4 | Event payload validation | direct | eventHandler/event_schema.py |
| PyJWT | 2.13.0 | Decode HS256 JWT wrapping the portal password | direct | database/db_secret.py |
| pycryptodome | 3.23.0 | AES-CBC decrypt of the portal password (`Crypto.Cipher`) | direct | database/db_secret.py |
| requests | 2.34.2 | Slack webhook POST, public-IP lookup | direct | utils/slack.py, eventHandler/disconnected_monitors.py |
| slack_sdk | 3.43.0 | Slack `WebClient.files_upload_v2` for snapshots | direct | utils/slack.py |
| pytz | 2026.3.post1 | Timezone handling (Biotronik account local date) | direct | eventHandler/cron_job.py, utils/dates.py |
| python-dateutil | 2.9.0.post0 | Date parsing | direct | utils/dates.py |
| python-dotenv | 1.2.2 | `.env` loading | unknown whether used: no `dotenv` import found in the code | grep of *.py |

Indirect (pins only, not imported): annotated-types 0.8.0, attrs 26.1.0, certifi 2026.7.22, cffi 2.1.1, charset-normalizer 3.4.9, dnspython 2.8.0, h11 0.16.0, idna 3.18, jmespath 1.1.0, outcome 1.3.0.post0, packaging 26.3, pycparser 3.0, pydantic_core 2.46.4, PySocks 1.7.1, six 1.17.0, sniffio 1.3.1, sortedcontainers 2.4.0, trio 0.34.0, trio-websocket 0.12.2, typing-inspection 0.4.3, typing_extensions 4.16.0, urllib3 2.7.0 (also imported by main.py for `HTTPError`), websocket-client 1.9.0, wsproto 1.3.2.

## External systems

| System | Role | Class | Evidence |
|---|---|---|---|
| Abbott Merlin.net portal | Crawl: patient and transmission lists, set next send. URLs: `http://merlin.net/`, login alt `https://www.merlin.net/web/chakravyuh/login`, change password `https://www.merlin.net/web/chakravyuh/changepassword`, logout `.../logout` | external-system | constants.py:2,15,16,23 |
| Medtronic CareLink portal | Crawl. `https://clc.medtroniccarelink.net/account-management/login`; password reset `.../password-management/reset-password` | external-system | constants.py:3,14 |
| Biotronik Home Monitoring | Crawl and report export. `https://www.biotronik-homemonitoring.com/hmsc_guiWeb/user/site/SignIn.jsf`; sign out `.../SignOut.jsf` | external-system | constants.py:4-6,17-19 |
| Boston Scientific Latitude NXT and Clarity | Crawl. Login `https://www.latitudenxt.bostonscientific.com/clinic/login?locale=en_US`, patient list `.../clinic/patientList/review` (and `?viewOption=DIAG`); alt `.../clinic/login` | external-system | constants.py:7-12,24; Boston_Scientific/latitude_*.py |
| MongoDB | Primary datastore. Connection via secret keys `DB_URI`, `DATABASE_NAME` (names only). Hosting (Atlas or self-managed): `unknown` | external-system | database/connection.py |
| AWS Secrets Manager | Runtime config secret, id from env `SM_NAME`, region from `SM_REGION`. Keys read from the JSON: `DB_URI`, `DATABASE_NAME`, `BOT_SECRET_KEY_PROD` (AES key and JWT secret, comma separated), `SLACK_URL`, `SLACK_URL_NOSHOW`, `ERROR_SLACK_URL`, `SLACK_URL_PASSWORD_EXPIRED`, `BOT_CHANNEL_ID`, `EVOKE_ALERT_TOKEN` | external-system | utils/secretString.py, utils/config.py, database/db_secret.py |
| AWS S3 | JSON results and failure screenshots, bucket env `PROCESSED_BUCKET`, key prefix env `S3_NOSHOW_KEY_PREFIX` | external-system | utils/exportToS3.py, eventHandler/disconnected_monitors.py |
| Slack (incoming webhooks and Web API) | Progress and error notifications, snapshot upload | external-system | utils/slack.py |
| api.ipify.org | Public egress IP lookup, recorded in no-show log reason (portal allow-listing hint) | external-system | eventHandler/disconnected_monitors.py:84 |
| AWS SQS (bot queue) | Inbound trigger, `Records[].body`, partial batch response. Queue name, FIFO or standard, DLQ, visibility timeout, batch size: `unknown` (no IaC in repo) | external-system | main.py:93-135 |
| AWS EventBridge | A second Lambda is deployed from the same image under variable `EVENTBRIDGE_BOT_LAMBDA`, implying a scheduled `CRON_JOB` function. Schedules/rules not in repo: `unknown` | external-system | bitbucket-pipelines.yml |
| AWS ECR / Lambda / Bitbucket OIDC | Image build and deploy | build-only | bitbucket-pipelines.yml |

Environment variable names (code only): `SM_NAME`, `SM_REGION`, `PROCESSED_BUCKET`, `S3_NOSHOW_KEY_PREFIX`, `SLACK_URL` (override of the secret's value), `LOCAL_EXECUTION`, `CHROME_BINARY_LOCATION_PATH`, `SELENIUM_SERVICE_EXECUTABLE_PATH`, `LOG_LEVEL`, `AWS_BATCH_JOB_ID` (used only in a Slack message). Pipeline variables: `AWS_REGION`, `AWS_ROLE_ARN`, `MANUFACTURE_BOT_ECR_REGISTRY`, `MANUFACTURE_BOT_IMAGE`, `MANUFACTURE_BOT_LAMBDA`, `EVENTBRIDGE_BOT_LAMBDA`. No values recorded.

Credential handling (names only): manufacturer portal usernames and passwords live in the `manufacturer_accounts` collection; the password is a JWT (HS256) wrapping an AES-CBC ciphertext, decrypted in process with `BOT_SECRET_KEY_PROD` (database/db_secret.py). The secret is fetched at import time (`the module-level SECRET set from get_secret()`); on failure the secret stays empty and `process_event` returns an error ack (main.py:186).

## Internal repository dependencies (shared MongoDB, no code or package link)

No internal package, generated client or shared library is imported. Coupling to other registered repositories is by shared database collections and by inbound events:

| Edge | Direction | Basis | Evidence | Status |
|---|---|---|---|---|
| patient-billing-schedule -> manufacturer-crawler | events (BOT_EVENT_TRIGGER, BOT_EVENTS_TRIGGER) | Payload fields accepted (see interfaces.md). Sender code not read here | event_schema.py, README.md | observed (receiver side only) |
| rest-api-evoke -> manufacturer-crawler | events (BOT_EVENT_TRIGGER) and synchronous invoke (GET_DISCONNECTED_MONITORS) | Receiver supports both | main.py:93-95, event_schema.py | observed (receiver side only) |
| manufacturer-hl7-parser <-> manufacturer-crawler | shared data: `reports` collection | The crawler reads `reports` (documents of fields `manufacturer`, `account`, `report_date`, `patient_serial_num`, `billing_code`, `device_category`, `summary_report_flag`, `last_billing_date`) and writes `transmission_alert_information` to them. Who creates `reports` documents: `unknown` from this repo; a manufacturer report parser is the plausible producer (inferred) | cron_job.py, recrawl.py, trackAlert.py | inferred |
| client-emr-hl7-parser | none found | no reference | grep | unknown |
| evoke-portal-front-end | none found in code. The portal plausibly presents `manufacturer_crawler_report_status`; not verifiable here | n/a | n/a | unknown |

### Shared MongoDB collections (same database, schema ownership not defined in this repo)

| Collection | Crawler access | Fields observed | Likely shared with |
|---|---|---|---|
| `manufacturer_accounts` | read (`isActive`, `manufacturer`, `account`, `username`, `password`, `isILRDevices`); write: `update_one` setting `isActive: false`, `schedule: false`, `haltInfo{haltedBy, haltedReason, haltedAt}` on expired password | utils/accounts.py, db_secret.py | rest-api-evoke (admin of accounts, inferred), portal |
| `patients` | read only: `_id`, `manufacturer`, `account`, `next_send`, `information.in_office_only`, `serial_number`, `deviceInformation.modelNumber`, `name`, `firstName`, `lastName`, `dob`, `evoke_id`, `active`. The crawler never writes `patients` (next_send is changed in the manufacturer portal, not in Mongo) | getPatient.py, cron_job.py | patient-billing-schedule (reads and writes patients), rest-api-evoke |
| `reports` | read (`report_date`, `manufacturer`, `account`, `billing_code`, `patient_serial_num`, `name`, ...); write: `$set transmission_alert_information{alert_priority, alert_description}` via `update_many` by `_id` (Medtronic and Abbott) | updateDocument.py, trackAlert.py, Abbott transmission_crawler.py:516 | patient-billing-schedule (marks reports billable), manufacturer-hl7-parser (inferred) |
| `manufacturer_crawler_report_status` | write (upsert via `ReplaceOne` filter `{patient_id}`, so one document per patient, last write wins) and read (recrawl, cron dedupe) | export.py:generate_log | rest-api-evoke / portal (inferred); patient-billing-schedule: `unknown` |
| `manufacturer_crawler_account_status` | read and write (filter `{manufacturer, account}`): `crawl_status{status, crawled_upto, password_expired, password_expired_at}` | recrawl.py, Abbott/Boston/Medtronic crawlers | crawler only as far as seen |
| `biotronik_exported_reports` | read and write (`_id` = patient id, `name`, `account`, `serial_number`, `exported_at`) | cron_job.py, biotronik.py:371 | crawler only |
| `noshow_disconnected_logs` | write (replace-one upsert by manufacturer, account, status, account_type) | disconnected_monitors.py:186 | rest-api-evoke / portal (inferred) |
| `live_call_tasks` | not referenced in this repo | grep | n/a (shared by patient-billing-schedule only) |

Schema-drift risk: the crawler reads `patients.next_send` as BSON datetime (`.date()`, `.strftime`) and `reports.patient_serial_num`; any change by patient-billing-schedule or a parser to these types breaks the crawler. Index definitions: `unknown` (none in repo).

## Unknowns

- Queue/EventBridge/IAM/Lambda settings (timeout, memory, reserved concurrency, batch size, FIFO) - checked: no IaC, SAM, serverless or terraform files in the tree.
- Whether `python-dotenv` is used anywhere (not imported).
- Whether Python 3.14 wheels exist for all pins; Selenium 4.47 versus Chrome 114 behaviour.
- Producers of `reports` documents and consumers of `manufacturer_crawler_report_status` (cross-repo reading out of scope).
