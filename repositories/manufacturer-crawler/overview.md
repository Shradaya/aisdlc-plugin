---
repository: manufacturer-crawler
analyzed_commit: d6aa388a03c12e777846a704818ba5903a021a4f
analyzed_branch: main
analyzed_at: 2026-10-15T08:55:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [Dockerfile, bitbucket-pipelines.yml, main.py, constants.py, requirements.txt, README.md, sonar-project.properties, utils/config.py, utils/secretString.py, eventHandler/event_schema.py, snapshot file listing (71 files)]
---

# manufacturer-crawler: Overview

## Identity (Phase A)

| Item | Value | Status |
|---|---|---|
| Name | `manufacturer-crawler` (README title "Manufacturer Crawler Bot"; README test notes call the Lambda `bot_lambda`; the pipeline deploys to the functions named by env vars `MANUFACTURE_BOT_LAMBDA` and `EVENTBRIDGE_BOT_LAMBDA`, `bitbucket-pipelines.yml`). `sonar-project.properties` projectKey mentions `manufacturer-hl7-parser` (copy-paste leftover, inferred). | observed |
| Remote | `git@bitbucket.org:evoke-medical-care/manufacturer-crawler.git` (from the onboarding request) | observed |
| Local path | `${AISDLC_REPOS_ROOT}/manufacturer-crawler` | observed |
| Base branch / commit | `main` at `d6aa388a03c12e777846a704818ba5903a021a4f` ("Merged in patch (pull request #205)", 2026-10-14T14:38:00Z); 837 commits (from the request) | observed |
| Type | AWS Lambda function packaged as a container image; entry `main.lambda_handler` (`Dockerfile` CMD) | observed |
| Language / runtime | Python 3.14 (`FROM public.ecr.aws/lambda/python:3.14`) | observed |
| Browser | Chrome snapshot build 1135561 and chromedriver 114.0.5735.90 downloaded at image build into `/opt` (`Dockerfile`) | observed |
| Main libraries | selenium 4.47.0, pymongo 4.17.0, boto3/botocore 1.43.68, pydantic 2.13.4, PyJWT 2.13.0, pycryptodome 3.23.0, slack_sdk 3.43.0, requests 2.34.2, webdriver-manager 4.1.2, pytz, python-dateutil, python-dotenv (all `==` pins, `requirements.txt`) | observed |
| Size | 71 tracked files, 63 `.py`, about 10.9k lines (wc over the snapshot) | observed |
| Tests | none found (no test files, no pytest/unittest imports; `eventHandler/test_report.py` is an event handler, not a test) | observed |
| Docs | `README.md` (setup, sample events); links a Confluence "Technical Understanding Document", not readable here | observed / unknown |

## Purpose (as observed in code)

The Lambda drives a headless Chrome (Selenium) against four remote-monitoring manufacturer portals and keeps Evoke patient data in step with them:

- Portals: Abbott Merlin (`manufacturer/Abbott_Merlin/`), Biotronik (`manufacturer/Biotronik/`), Boston Scientific Latitude NXT and Clarity (`manufacturer/Boston_Scientific/`), Medtronic Carelink (`manufacturer/Medtronic_Carelink/`); URLs in `constants.py`.
- It sets the patient's "next send" (scheduled transmission) date in the portal (`patient_crawler.py` and `transmission_crawler.py` per manufacturer; Slack text "Next send successfully scheduled [before-->after]").
- For Biotronik it creates and exports reports in the portal and records the export in `biotronik_exported_reports` (`manufacturer/Biotronik/biotronik.py`).
- For Medtronic and Abbott it reads transmission alert priority and description and writes them to `reports` (`Medtronic_Carelink/trackAlert.py`, `Abbott_Merlin/transmission_crawler.py`, both via `database.updateRecords`).
- It lists "disconnected monitors" per account and stores the JSON result in S3 (`eventHandler/disconnected_monitors.py`).
- It logs per-patient outcomes to `manufacturer_crawler_report_status` and per-account state to `manufacturer_crawler_account_status`, and halts an account (`isActive: false`) when the portal reports expired or wrong credentials (`utils/accounts.py` `setAccountsAsHalted`).
- It reports progress and errors to Slack webhooks (`utils/slack.py`).

## Triggers (observed)

`main.py` `run_lambda_handler`: an event with `Records` is an SQS batch (each body parsed as JSON, cookies cleared between records, response `{"batchItemFailures": [...]}`, and an exception when all records fail); anything else is processed as one direct event. Payloads are validated by pydantic models in `eventHandler/event_schema.py` (extra fields allowed). Event types (`constants.eventType`):

| eventType | Handler | Notes |
|---|---|---|
| `BOT_EVENT_TRIGGER` | `eventHandler/bot_trigger.py` | `value` = patient id; returns an ack `{status 200 or 202, message}` |
| `BOT_EVENTS_TRIGGER` | `eventHandler/bot_triggers.py` | `manufacturer`, `account`, `patient_ids[]` (batch, one account) |
| `RECRAWL` | `eventHandler/recrawl.py` | retries failed patients (last 24 h and last 30 days) and failed or in-progress accounts, cap 200 (`TOTAL_RECRAWLED_PATIENTS`) |
| `TEST_REPORT` | `eventHandler/test_report.py` | purpose unknown beyond a 14-line handler (not read in detail) |
| `GET_DISCONNECTED_MONITORS` | `eventHandler/disconnected_monitors.py` | per manufacturer or account (`account_type` NXT or CLARITY for Boston Scientific) |
| `CRON_JOB` | `eventHandler/cron_job.py` | reports of the last 24 h (`TIME_PERIOD`), or Biotronik patients due today per account timezone |

What publishes these events (EventBridge schedules, SQS producers such as `patient-billing-schedule` bot events) is `unknown`: no infrastructure definitions here. The pipeline updates two functions (`MANUFACTURE_BOT_LAMBDA`, `EVENTBRIDGE_BOT_LAMBDA`) with one image, suggesting an SQS/direct-invoke function and an EventBridge-driven function (inferred).

## Unknowns

- Business rules for next-send adjustment (`utils/helpers.py` `get_next_send`, `preAuthAccount = ["CVMA"]`, `default_next_send_cycle` 31): meaning not documented in the repo.
- Lambda runtime configuration (memory, timeout, concurrency, SQS mapping, schedules): not in the repo.
- `TEST_REPORT` behavior in production.
