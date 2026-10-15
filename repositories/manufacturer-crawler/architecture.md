---
repository: manufacturer-crawler
analyzed_commit: d6aa388a03c12e777846a704818ba5903a021a4f
analyzed_branch: main
analyzed_at: 2026-10-15T08:55:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [main.py, constants.py, Dockerfile, bitbucket-pipelines.yml, requirements.txt, README.md, eventHandler/event_schema.py, eventHandler/bot_trigger.py, eventHandler/bot_triggers.py, eventHandler/recrawl.py, eventHandler/test_report.py, eventHandler/cron_job.py, eventHandler/disconnected_monitors.py, utils/config.py, utils/secretString.py, utils/accounts.py, utils/slack.py, utils/exportToS3.py, utils/helpers.py, utils/response.py, utils/reportStatus.py, database/connection.py, database/db_secret.py, database/export.py, database/insertDocument.py, database/getDocument.py, database/getPatient.py, database/getReports.py, database/updateDocument.py, database/run_aggregation.py, database/noShowRecord.py, manufacturer/__init__.py, manufacturer/Abbott_Merlin/abbott.py, manufacturer/Abbott_Merlin/utils.py, manufacturer/Medtronic_Carelink/carelink.py, manufacturer/Medtronic_Carelink/patient_crawler.py, manufacturer/Medtronic_Carelink/transmission_crawler.py, manufacturer/Medtronic_Carelink/trackAlert.py, manufacturer/Medtronic_Carelink/utils.py, manufacturer/Boston_Scientific/boston.py, manufacturer/Boston_Scientific/disconnected_monitors.py, manufacturer/Biotronik/biotronik.py, manufacturer/Biotronik/disconnected_monitors.py, system/repository-relationships.yaml, repositories/rest-api-evoke/architecture.md]
---

# Architecture (Phase C)

Repository: `${AISDLC_REPOS_ROOT}/manufacturer-crawler`. Analysis was done on an exact `git archive` of origin/main at `d6aa388`, not on the developer checkout. Claims are `observed` (seen in code, file cited) unless tagged `[inferred]` or `unknown` (with what was checked). Secrets and env are named by variable only. NOT read, by instruction: `.env.example` and any `.env`, so the full env var list is `unknown`; only variables referenced in code are named. The deployed Lambda configuration (memory, timeout, VPC, IAM, reserved concurrency, event source mappings, EventBridge rules, SQS queue settings) is not in the repo and is `unknown`; checked: all tracked files (no SAM, CloudFormation, Terraform, serverless config). There is no `tests/` directory and no test step in the pipeline.

## 1. Shape of the system

A single Python 3.14 AWS Lambda packaged as a container image (`Dockerfile:1`, `CMD ["main.lambda_handler"]` at `Dockerfile:25`). It drives headless Chrome through Selenium to log in to four cardiac-device manufacturer portals and, depending on the event, (a) writes the patient's "next send" date into the portal and dismisses transmissions there, (b) records alert data on stored reports, (c) triggers a Biotronik EHR export in the portal, or (d) scrapes the list of disconnected monitors. State is read and written in a shared MongoDB; error and progress alerts go to Slack; only disconnected-monitor results and error screenshots go to S3. One process, synchronous and sequential: no threads or async, one browser at a time `[observed: single module-level driver passed down]`. About 9,850 lines in 60 tracked Python files.

Important correction to a common assumption: this bot does NOT download report files or parse documents. Reports are created by the sibling parser (`manufacturer-hl7-parser`); the crawler reads the portal UI (HTML tables, date pickers) and writes back to the portal and to Mongo (`manufacturer/Medtronic_Carelink/patient_crawler.py`, `transmission_crawler.py`; `manufacturer/Biotronik/biotronik.py`). Grep for `download`, `expanduser` and file-save paths found none. "Export" in this repo means (1) Biotronik's portal "export to EMR" button (`biotronik.py` `DisplayPatientHistory:exportEmrDataButton`) and (2) writes to `manufacturer_crawler_report_status`.

## 2. Entry points

| Entry | Where | Detail |
|---|---|---|
| Lambda handler | `lambda_handler(event, context)` `main.py:42` | Prints the whole event (`main.py:43`, so payloads, including patient ids, reach CloudWatch), runs `run_lambda_handler`, and always removes the three module-level temp dirs in `finally` (`main.py:37-39,47-50`). Deployed handler string is `Dockerfile` CMD `main.lambda_handler`. |
| Local run | `main.py` has no `__main__` block. `README.md` says to call the handler manually; with `LOCAL_EXECUTION` truthy `create_chrome_driver` uses local Chrome paths (`main.py:56-66`). If the local Chrome paths are not set it returns `None` and the run is silently skipped (`main.py:57-59,89-90`). |

Deployment targets (`bitbucket-pipelines.yml`): on every push to `main`, one step builds the image, tags it `latest`, pushes it to ECR and runs `aws lambda update-function-code` for TWO functions, `$MANUFACTURE_BOT_LAMBDA` and `$EVENTBRIDGE_BOT_LAMBDA`, with the same image (the pipeline step is labelled `deployment: "Production"`). README names the function `bot_lambda`. That the EventBridge function is the one that receives `CRON_JOB` events and the other the SQS-fed one is `[inferred]` from the variable names; the wiring is `unknown`.

### Event routing

`run_lambda_handler` (`main.py:87-135`):

1. Creates a Chrome driver first (before looking at the event).
2. If the event is a dict without `Records` (direct invoke, EventBridge, console test): a single event. `process_event(driver, event, event, context)` and the first tuple member (the "ack") is returned to the caller (`main.py:93-95`).
3. If `Records` exists (SQS): loop over records in order. Record N>0 first calls `reset_browser` (clear cookies, or quit and recreate driver). Each body is `json.loads`-ed; an unparsable body is passed on as the raw string (then rejected by validation). Exceptions escaping `process_event` are collected as failures.

`process_event` (`main.py:159-461`) first validates the payload with pydantic (section 3), loads secrets, calls `utils.config.update_config(event_type)`, opens the Mongo connection, loads the active manufacturer credentials, and dispatches on `eventType`.

## 3. Event types and payload contracts

Schema: `eventHandler/event_schema.py`. All models use `extra="allow"` (unknown keys are kept) and the result is `model_dump(exclude_none=True)`. Valid manufacturer strings: `Medtronic`, `Boston Scientific`, `Biotronik`, `Abbott` (`constants.py` `MANUFACTURERS`). Note the portal "Abbott Merlin" is the manufacturer string `Abbott`, and "Carelink" is `Medtronic`.

| eventType | Required fields | Handler | What it does |
|---|---|---|---|
| `BOT_EVENT_TRIGGER` | `value` (patient id string) | `eventHandler/bot_trigger.py` | Single patient next-send update. Looks up the patient in `patients` (excluding `information.in_office_only: true`). Not found: returns `ack=None`, no crawl. Account not in the active accounts: `setError` (202) and Slack. Biotronik: only crawled when `next_send` date equals today (UTC), else returns `setSuccess("Document will be exported at <date>")` without crawling. Otherwise crawls with the patient document. Per-account crawl loop stops after the first credential that returns status 200 (`main.py:377-378`). |
| `BOT_EVENTS_TRIGGER` | `manufacturer`, `account`, non-empty `patient_ids` list | `eventHandler/bot_triggers.py` | Batch of patients of one manufacturer and account. Same eligibility filter and active-account check; Biotronik patients are filtered to those due today. Nothing due: `setSuccess("No patients are due to be exported.")`. |
| `RECRAWL` | `manufacturer`; `value` optional list of patient ids | `eventHandler/recrawl.py` | With `value`: those patients (with `next_send >= today`). Without: picks up to 100 patients from `manufacturer_crawler_report_status` with `status: Fail` and a reason not in `RECRAWL_IGNORE_REASONS` (first the last 24 h of `BOT_EVENT_TRIGGER` failures, then failures 24 h to 30 days old), plus (up to the 200 total `TOTAL_RECRAWLED_PATIENTS`) patients with reports newer than `crawled_upto` of accounts in `manufacturer_crawler_account_status` with `Fail` or `In Progress` (within 30 days; HF-named reports excluded). It also returns `logs` used to update `manufacturer_crawler_account_status`. |
| `TEST_REPORT` | `value` list of report ids (`reports._id`) | `eventHandler/test_report.py` | Loads the reports by id and crawls them like a cron run (transmission crawl path). No manufacturer is required; see risk R7. |
| `GET_DISCONNECTED_MONITORS` | `manufacturer`; `account` required unless `includeAllAccounts: true`; optional `account_type` `NXT` or `CLARITY` (upper-cased) | `eventHandler/disconnected_monitors.py` | Scrapes the portal's disconnected-monitor lists, not a patient crawl. See section 6. |
| `CRON_JOB` | `manufacturer`; `account` optional | `eventHandler/cron_job.py` | Scheduled sweep. Biotronik: patients due today (account local date equals the UTC date, via `timezoneMapping`) from `patients`, minus those already in `biotronik_exported_reports` today. Medtronic, Boston Scientific, Abbott: `reports` aggregation for `report_date` within the last `TIME_PERIOD` (24 h), `billing_code` not in the HF codes, accounts restricted to active ones, ILR summary-report rule for Medtronic and Abbott; for Boston Scientific the reports are joined to `patients` and kept only when no status log exists for the patient, `next_send` moved since the last log, or the last log is `Fail`. Accounts whose credentials exist but whose reports are not "live" are reported to Slack as "require release in order to be crawled". |

Any other `eventType`, a missing required field, or a non-object payload: `ValueError`, then a Slack error ("Invalid event payload received", with `<!here>`) and `process_event` returns `(None, driver)`. This is NOT a failure for SQS (the message is deleted) and returns `null` for a direct invoke `[observed: main.py:169-179]`.

## 4. Per-manufacturer crawl flow

Dispatch: `function_mapping` in `main.py:283-288` maps `Abbott`, `Medtronic`, `Biotronik`, `Boston Scientific` to `crawl_abbott`, `crawl_mdc`, `crawl_biotronik`, `crawl_boston` (`manufacturer/__init__.py`). Documents are grouped per `account`; credentials for the account and manufacturer come from `manufacturer_accounts` (section 8). An account can have several credential rows; `CRAWL_SEPARATELY` (`utils/config.py:18-23`) currently only lists Medtronic account `Centra`, whose ILR and non-ILR patients are split across credentials by `isILRDevices` (`utils/helpers.py:separate_ILR_reports`). Common signature `(driver, login_accounts, documents, database, event_type, logs, manufacturer_secrets)`.

Common pattern per portal: open the login URL (`constants.py`), wait for the form (30 s `WebDriverWait`), type username/password (Biotronik also a user group), click submit, branch on mode, sign out, and on any exception take a screenshot to `/tmp/snapshot.png`, inspect the URL to classify login failure versus layout failure, and alert Slack.

Modes (for Abbott, Medtronic, Boston Scientific): "bot triggered" = `BOT_EVENT_TRIGGER`, `BOT_EVENTS_TRIGGER`, `RECRAWL` runs the patient-search flow (`patient_crawler.py`: search by device serial number, verify patient name via `isPatientNameMatched` and serial number, read the portal "Next Send", and if it differs from `patients.next_send` (shifted by 7 days for pre-auth account `CVMA`, `utils/helpers.py:get_next_send`, `utils/config.py:preAuthAccount`) type the new date into the date picker and click save). Other events (`CRON_JOB`, `TEST_REPORT`) run the transmission-list flow (`transmission_crawler.py`: walk the active transmissions list, match reports, set next send, read alert priority and descriptions, update `reports.transmission_alert_information` for the report and its same-day HF reports via `updateRecords`, then select the processed transmissions, set status `Viewed` and press Dismiss in the portal, then write the success logs). Bot-triggered runs are gated by the account's `schedule` flag in `manufacturer_accounts`; with the flag off the patient gets a `Fail` log "The scheduler toggle is turned off in the UI." and no portal change (`carelink.py:230-244`, `abbott.py:87-101`, `boston.py:353-364`).

| Manufacturer | Login URL constant | Specifics |
|---|---|---|
| Abbott Merlin (`manufacturer/Abbott_Merlin/`) | `Abbott_Merlin_URL` `http://merlin.net/` | Login retried twice; page refresh plus 15 s sleep if the form does not appear; sign-out via class `unbold`. Both modes plus alerts (`MANUFACTURER_WITH_ALERT_CRAWLING` = Medtronic and Abbott). |
| Medtronic Carelink (`manufacturer/Medtronic_Carelink/`) | `Medtronic_Carelink_URL` | Angular Material DOM (`formcontrolname`, `mat-legacy-*` classes, custom columns via `customize_column.py`). Re-raises `NoSuchWindowException`, `InvalidSessionIdException`, `HTTPError` so `main.py` can restart the browser. |
| Boston Scientific Latitude (`manufacturer/Boston_Scientific/`) | `Boston_Scientific_URL` | One login, then NXT (`latitude_nxt.py`) and/or Clarity (`latitude_clarity.py`). Patients routed to Clarity when they have an ILR billing code (`ILR_BILLING_CODES` 93298 and 93298 26); other patients go to NXT. Note the `ack` of the last site overwrites the first. |
| Biotronik (`manufacturer/Biotronik/biotronik.py`) | `BIOTRONIK_URL` | Not a next-send flow: for each due patient it searches by serial number, reads the patient history, and (if a transmission newer than the last export exists, the export button is enabled and the patient is still due today) clicks "export to EMR" with "include PDF", then writes `biotronik_exported_reports`. Outcomes `Already Exported`, `Not Found`, `Fail` are logged. Account timezone from `timezoneMapping` (a missing account is a `KeyError` inside the crawl, caught by the outer handler). |

Credential failure handling (`turnOffCrawler` in `Abbott_Merlin/utils.py` and `Medtronic_Carelink/utils.py`; inline in `boston.py:493-541`): when the portal shows the incorrect-password or expired-password message, the account row in `manufacturer_accounts` is set `isActive: false`, `schedule: false` with `haltInfo` (`utils/accounts.py:setAccountsAsHalted`), a `<!channel>` "Credentials Expired" message goes to the dedicated Slack URL `SLACK_URL_PASSWORD_EXPIRED`, and `manufacturer_crawler_account_status` is upserted with `password_expired: true` and `status: Fail`. This is an automatic write that disables the account for all later events, including the rest-api-evoke eligibility check (it reads active `manufacturer_accounts`, `repositories/rest-api-evoke/architecture.md`).

## 5. Browser lifecycle and recovery

- Chrome and chromedriver are baked into the image and pinned in `Dockerfile`: chromedriver 114.0.5735.90 and a Chromium snapshot (build 1135561) unzipped to `/opt/chromedriver` and `/opt/chrome-linux/chrome` (`main.py:69-70`). Selenium is 4.47.0 (`requirements.txt`). Headless flags: `--headless --single-process --no-zygote --no-sandbox --disable-dev-shm-usage --disable-gpu`, window 1520x800, remote debugging port 9222 (`main.py:71-83`).
- Temp dirs for Chrome profile, data and cache are created at import time (`main.py:37-39`) and deleted after every invocation (`main.py:47-50`). On a warm container the second invocation reuses the same (now deleted) paths; Chrome presumably recreates them `[inferred, not verified]`.
- One driver per invocation. Cookies are cleared between SQS records and between accounts (`reset_browser`, `main.py:138-156`; `main.py:368-375`), recreating the browser if clearing fails.
- Session crash recovery in `main.py:322-366`: a `WebDriverException` or urllib3 `HTTPError` escaping a crawler causes `driver.quit()`, a new driver, and ONE retry of the whole crawl for that account; if the retry fails, a Slack alert is sent, the ack is `setError`, and a fresh driver is created. Only the Medtronic crawler deliberately re-raises session errors (`carelink.py:262-263`); the Abbott, Boston Scientific and Biotronik crawlers catch every exception themselves and return, so session crashes there are not retried by this mechanism `[observed]`.
- The retry re-runs the full document list; portal writes already made by the first attempt are idempotent only through the crawler's "already scheduled" comparison `[inferred]`.
- The driver is never closed at the end of a normal invocation (`driver.quit()` only on error paths); the container teardown kills it `[observed: no quit in the happy path]`.

## 6. GET_DISCONNECTED_MONITORS in detail (and what the Lambda returns)

`disconnected_monitors_event_handler` (`eventHandler/disconnected_monitors.py:30-244`) per account:

1. Account list = all active accounts of the manufacturer when `includeAllAccounts` is true, else the single `account` (inactive: returns `setError(...)` = `{"status": 202, "message": ...}`).
2. Calls the manufacturer scraper `getDisconnectedMonitorsFromCarelink|Abbott|Latitude|Biotronik(database, driver, account, manufacturer, account_type)`, which logs in with credentials read via `getSecret` and returns `{"hasError": bool, "message": str, "data": [...]}` (Boston Scientific without `account_type` also returns `hasNxtError`, `nxtMessage`, `hasClarityError`, `clarityMessage`, and merges NXT and Clarity rows; Boston Scientific login is retried twice).
3. Drops rows whose `next_send` is older than two years (`filter_recent_next_send`).
4. On success writes the result to S3 (below). On failure sets status `Fail`.
5. Upserts one document in `noshow_disconnected_logs` per account, keyed by `{manufacturer, account, status[, account_type]}` (so a `Success` row and a `Fail` row for the same account coexist), with `s3_key`, `event`, `failed_reason` including the Lambda egress public IP (looked up from `https://api.ipify.org` with no timeout and no error handling, `disconnected_monitors.py:84`).
6. Reprocess rule: if the invocation came from SQS (`"Records" in original_event`) and the failure text contains `Error: Message:` or `no such window` (`constants.REPROCESS_REASON`), the handler raises so that the SQS record fails and is retried (`disconnected_monitors.py:208-222`).

What the Lambda returns for this event type (matters to `rest-api-evoke`, which invokes synchronously and parses `Payload` as JSON, `repositories/rest-api-evoke/interfaces.md` line 211, `dependencies.md` line 77):

| Case | Return value |
|---|---|
| Single account, success | The scraper dict as-is: `{"hasError": false, "message": "Fetched Successfully", "data": [<rows>], ...}`. Row keys seen for Biotronik: name, serial, `doi`, `monitoring_status`, `last_send`, `next_send`, `dob` (`Biotronik/disconnected_monitors.py:180-190`); other manufacturers' row keys `unknown` (not audited in detail). |
| Single account, scraper reported an error | The handler raises internally, which is caught by the outer `except` and returned as `{"hasError": true, "message": "Something went wrong.", "data": "Error: Something went wrong. <detail>"}`; also posted to Slack. The Lambda invocation itself still succeeds (no `FunctionError`). |
| Single account, inactive | `{"status": 202, "message": "The account ... is inactive. ..."}` (different shape: no `hasError`). |
| `includeAllAccounts: true` | `{"message": "Execution completed!"}` only; the data goes to S3 and `noshow_disconnected_logs`. |
| Invalid payload | `null` (JSON `null`), not an error shape. |
| Secrets not loaded | `{"status": 202, "message": "Unable to load secrets: ..."}` (`main.py:186-190`; note: returns `ack, None`). |
| Chrome driver could not be created in local mode | `null`. |
| Lambda timeout or crash | Lambda `FunctionError`/timeout; the Evoke API caller must handle it (timeouts are `unknown`). |
| Via SQS | The return value is discarded; the Lambda returns `{"batchItemFailures": [...]}`. |

The handler also parses nothing from the caller beyond the fields above; a caller reading `data` must guard against the three non-standard shapes (202 object, `{"message"}` only, `null`).

## 7. SQS partial-batch semantics

(`main.py:97-135`.) For `Records` events the handler returns `{"batchItemFailures": [{"itemIdentifier": messageId}, ...]}`, which only has effect if the event source mapping enables `ReportBatchItemFailures` (`unknown`, not in repo). Rules:

- Record fails only when `process_event` raises. Most failures inside crawlers are caught, alerted to Slack, and turned into an ack, so they count as SUCCESS to SQS and the message is deleted. Validation errors are also treated as success.
- Some failures that do raise: reprocess-reason disconnected-monitor failures (above), unhandled errors in the handlers (for example `ObjectId(...)` on a malformed id, `KeyError` in `active_accounts[manufacturer]` when a manufacturer has no active account in `bot_trigger.py:40`, DB connection returning `None`).
- If ALL records in a batch fail, the handler raises (whole batch retried) rather than returning item failures. If SOME fail, only those are returned as failures.
- Records of a batch run sequentially in one invocation sharing one browser, so batch size times per-record duration must fit in the Lambda timeout (`unknown`). Timeout kills the batch; all not-yet-deleted messages return after the visibility timeout (`unknown`).
- Direct and EventBridge invokes do not use this path; errors there are returned or raised to the invoker.
- FIFO or standard type, batch size, DLQ and visibility timeout: `unknown`. Upstream senders use FIFO group ids and `BOT_EVENTS_TRIGGER` per `system/repository-relationships.yaml` (patient-billing-schedule to manufacturer-crawler edge), so the bot queue is probably FIFO `[inferred]`.

## 8. Persistence, configuration and secrets

Configuration flow: module import of `utils/config.py` reads Secrets Manager once per container (`SECRET = get_secret()`, `utils/secretString.py:13-31`, env `SM_NAME`, `SM_REGION`). On failure the secret is an empty dict and the handler returns an error ack for every event (`main.py:186-190`). Other env vars referenced in code (names only): `PROCESSED_BUCKET`, `S3_NOSHOW_KEY_PREFIX`, `SLACK_URL` (local override), `LOG_LEVEL`, `LOCAL_EXECUTION`, `CHROME_BINARY_LOCATION_PATH`, `SELENIUM_SERVICE_EXECUTABLE_PATH`, `AWS_BATCH_JOB_ID` (log pointer fallback). Secret keys referenced in code (names only): `DB_URI`, `DATABASE_NAME`, `SLACK_URL`, `ERROR_SLACK_URL`, `SLACK_URL_NOSHOW`, `SLACK_URL_PASSWORD_EXPIRED`, `BOT_CHANNEL_ID`, `EVOKE_ALERT_TOKEN`, `BOT_SECRET_KEY_PROD`. `update_config` swaps the normal Slack URL for the no-show Slack URL when the event is `GET_DISCONNECTED_MONITORS` (`utils/config.py:35-40`).

Portal credentials: stored in Mongo `manufacturer_accounts` (fields used: `manufacturer`, `account`, `username`, `password`, `usergroup` (Biotronik), `isActive`, `schedule`, `isILRDevices`, `haltInfo`). The password is a JWT (HS256) wrapping an AES-CBC ciphertext, decoded in memory with a key pair from the secret `BOT_SECRET_KEY_PROD` (`database/db_secret.py:32-42`). The decoded passwords are held in the list passed through the crawl and typed into the portals. Production key name is hard-coded: there is no non-prod key path `[observed]`.

MongoDB (pymongo, `database/connection.py`): one `MongoClient` per processed event, never closed, no explicit timeouts or retry settings in code. A connection failure returns `None` and later calls raise.

| Collection | Access | Used by |
|---|---|---|
| `manufacturer_accounts` | read (credentials, active flags); update (halt) | `getSecret`, `setAccountsAsHalted` |
| `patients` | read (aggregation, lookups by id or serial, `information.in_office_only`, `next_send`, `deviceInformation.modelNumber`, `implanted_billing_schedule.*`) | handlers, `generate_log`, crawlers |
| `reports` | read (cron/recrawl/test), update (`transmission_alert_information` via `updateRecords`) | handlers, `trackAlert.py` and Abbott equivalent |
| `manufacturer_crawler_report_status` | upsert one document per `patient_id` (replace, upsert) and read | `exportToDatabase` / `generate_log` (`database/export.py`), recrawl and cron filters |
| `manufacturer_crawler_account_status` | upsert by `{manufacturer, account}`, read | crawlers (after login), `turnOffCrawler`, recrawl |
| `biotronik_exported_reports` | upsert by `_id`, read | `biotronik.py:373-390`, `cron_job.py` |
| `noshow_disconnected_logs` | upsert by manufacturer/account/status/type | disconnected-monitor handler; `log_failed_noshow_records` exists but is unused (`database/noShowRecord.py`) |

Reports status (`manufacturer_crawler_report_status`): `generate_log` builds `{patient_id (string), name, manufacturer, account, next_send:{preceding_next_send,current_next_send}, status, error:{hasError, reason}, event_type, created_at}` (`database/export.py:98-114`). Status values (`constants.STATUS`): `Fail`, `Success`, `Not Found`, `In Progress`, `Already Exported`, `Already Scheduled`, `Already Transferred`. `exportToDatabase` replaces on `{patient_id}` with upsert, so there is ONE document per patient holding the latest outcome; it is not an append-only history (so the `created_at` sort used by cron `$lookup` and `fetchDocument` always sees a single latest row per patient). Other writers exist (sibling `patient-billing-schedule` writes `Skipped` and `Fail` rows into this collection, per `system/repository-relationships.yaml`). After a `CRON_JOB` for any manufacturer except Biotronik, `main.py:388-441` writes a `Fail` log "No any crawl report found for this patient." for patients of the crawled reports that have no status log created in the last 24 h.

S3 writes (`utils/exportToS3.py`, bucket from `PROCESSED_BUCKET`, default AWS credential chain):
- Disconnected monitors JSON: `<S3_NOSHOW_KEY_PREFIX>/<Manufacturer_with_underscores>/[<account_type lower>/]<YYYY-MM-DD>/<account_abbr>_<YYYY-MM-DD_HH-MM-SS>.json`, body `{...scraper response, "manufacturer", "account"}` (`disconnected_monitors.py:81-167`). Reader of this prefix is `unknown`; `rest-api-evoke` has a "no-show master list" feature that may read it `[inferred, not checked]`. With `includeAllAccounts`, the body's `account` is the event's account, which is `null`/absent (the handler overwrites `account` from the event at line 156), so the real account is only in the key name and `noshow_disconnected_logs` row, which also gets `account: None`. Marked as risk R5.
- Error screenshots: `manufacturer-bot-crawler/screenshots/<YYYY>/<MM>/<DD>/snapshot_<ts>.png`; the key is computed once at import (`utils/config.py:25-32`), so on a warm container every screenshot overwrites the same key. The local file is always `/tmp/snapshot.png`.

## 9. Failure handling and Slack alerts

`send_slack_msg` (`utils/slack.py`) posts JSON to a Slack webhook (no timeout, no raise); formats: message, block, exception, error, notification, numbered list, and variants that also upload the screenshot to S3. The channel is chosen by the message format: any format containing "error" goes to `ERROR_SLACK_URL` (falling back to `SLACK_URL`); the rest go to `SLACK_URL`, or to the no-show URL for `GET_DISCONNECTED_MONITORS`. The `<!channel>` credential-expired message goes to `SLACK_URL_PASSWORD_EXPIRED`. Alerts: start and end of every event (`Crawler Started`, `Execution completed`), `RESPONSE: <ack>` for bot events, invalid payload (`<!here>`), crawl failures with screenshot, DB errors, per-patient notifications of schedule changes. Patient names are not intentionally included but evoke ids, manufacturer and account are `[observed]`.

Failure model: errors are caught at the layer where they occur, a Slack message is sent and the event continues; the typed ack carries `status: 200` (success, `setSuccess`) or `status: 202` (error, `setError`) (`utils/response.py`). The ack is returned to the caller only for `BOT_EVENT_TRIGGER`, `BOT_EVENTS_TRIGGER` and (separately) `GET_DISCONNECTED_MONITORS`; for `CRON_JOB`, `RECRAWL`, `TEST_REPORT` the Lambda returns `None` (`main.py:456-461`). Database helper functions (`fetchPatient`, `fetchDocument`, `fetchReports`, `runAggregationPipeline`, `getSecret`) swallow exceptions, alert Slack and return `None`, so callers that unpack tuples (`documents, n = fetchDocument(...)`) then fail with `TypeError`.

Retries: Abbott login x2, Boston Scientific disconnected-monitor login x2, one whole-crawl retry after a browser crash (section 5), SQS-driven retries for raised exceptions (section 7), plus the recrawl and cron-based daily re-attempt via `Fail` status rows.

## 10. Concurrency, timeouts and scheduling

- Concurrency: one sequential flow per invocation; parallelism only across Lambda invocations. Reserved concurrency and SQS maximum concurrency are `unknown`. Two invocations for the same account at once would both log in to the same portal account; the sender side uses FIFO group ids by patient or by `<manufacturer>:<account>` to serialize `[inferred from relationships file]`.
- Timeouts: Selenium waits are 30 s (`WebDriverWait(driver, 30)`), plus fixed sleeps (for example 8 s after each Carelink search, 15 s Abbott refresh wait). The Lambda timeout is `unknown`; a long cron or all-accounts run is likely to be bounded by it (the pipeline sets only `max-time: 15` for the build step, which is the CI step, not the Lambda). There is no deadline awareness in code (`context.get_remaining_time_in_millis` is not used) `[observed by grep]`.
- Scheduling: no scheduler inside the code. `CRON_JOB` is presumably sent by EventBridge to the second function (`$EVENTBRIDGE_BOT_LAMBDA`); the rule, cadence and payload per manufacturer are `unknown` (not in the repo).
- Background workers: none; `time.sleep` inside the request only.

## 11. What breaks when a portal changes

Everything is locator-driven (IDs, classes, XPath, column titles such as `Device Serial Number`, `Next Send`, alert image names `gold.gif`/`red.gif` in `trackAlert.py`, history timestamp format `%b %d, %Y, %I:%M:%S %p` in Biotronik, message text `"Provided name and password combination was unrecognized..."`, `"The User ID and/or Password are incorrect."`, `"Invalid User Id and/or Password."`). Effects when one changes:

- Login locator or form change: the crawl raises, a screenshot and Slack alert are sent, and (non-Carelink) the exception is swallowed, so SQS sees success and the patient is not retried by the queue. The patient only gets a `Fail` status log in some paths; recrawl can pick it up later. Cron mode creates "No any crawl report found" `Fail` logs for the whole account.
- Error-message text changes (password text): the bot no longer recognizes a bad or expired password, so it keeps logging in with a bad password on every event (risk of lockout) and keeps posting generic "Something went wrong" errors instead of halting the account.
- Next-send column/date-picker change (Carelink, Abbott, Latitude): next send is not updated in the portal and `reports`/`patients` drift from the portal; alert fields are not written; transmissions are not dismissed.
- Biotronik history layout change: export is not clicked; the row stays due and is retried each cron the same day; at day roll the patient falls out of the due window and the export for that day is lost.
- Disconnected-monitor table change: returns `hasError: true` for the account; with `includeAllAccounts` the API caller sees only `"Execution completed!"` and must look at `noshow_disconnected_logs` and Slack to know that nothing was fetched.
- Error strings are also control flow: `REPROCESS_REASON` (`Error: Message:`, `no such window`) and `RECRAWL_IGNORE_REASONS` are matched by substring against reasons; rewording a reason string in a crawler silently changes recrawl and reprocess behavior.

## 12. Unknowns

| Item | Checked | Result |
|---|---|---|
| Lambda timeout, memory, concurrency, VPC and IAM | repo for IaC | `unknown` |
| Event source mapping, `ReportBatchItemFailures`, queue FIFO, DLQ | repo | `unknown` |
| EventBridge schedule and payloads for `CRON_JOB` | repo | `unknown` |
| `.env.example` / env var full list | not read by instruction | `unknown` |
| Row schema of non-Biotronik disconnected-monitor scrapers | file list only | not audited |
| Reader of the S3 no-show prefix | this repo only | `unknown` |
| Whether the SQS-fed and EventBridge-fed Lambdas share configuration | pipeline names only | `unknown` |
| Internals of `transmission_crawler.py` for Abbott, Boston Scientific (NXT and Clarity) | read at the level of entry points, grep for writes | only partly audited |
| Test coverage | no `tests/` directory | none |
