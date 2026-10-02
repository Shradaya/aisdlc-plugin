---
repository: rest-api-evoke
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [app.js, routes/index.js, middleware/*.js, util/config.js, util/database.js, database/index.js, util/v2/secret_manager/secretValue.js, util/v2/error.js, events/*.js, services/lambda.js, services/sqs.js, services/v2/hl7job.service.js, services/v2/transmission.v2.service.js, services/transmissions.js, services/v2/patient.v2.service.js, services/v2/twilio.v2.service.js, services/v2/manual_upload.v2.service.js, controllers/v2/coverPageGenerator.js, util/v2/sqs.v2.util.js, util/v2/sns.v2.util.js, util/v2/s3.v2.util.js]
---

# Architecture (Phase C)

Claims are `observed` (seen in tracked code at `4178ce4`, file:line cited) unless tagged `[inferred]` or `unknown` (with what was checked). Not opened: `Dockerfile` and `middleware/v2/urlEncodedParser.js` were skipped in this pass (a read was declined); Dockerfile facts come from `overview.md`.

## 1. Process model

One long-running Node process (`node app.js`, per `overview.md`), Express 4, no cluster, no worker/cron process. Grep for `setInterval`, cron/scheduler libraries, `process.on(...)`, `SIGTERM`, `unhandledRejection` found nothing outside tests, so: no in-process scheduler and no graceful shutdown or global rejection handler (observed by absence).

Startup order (`app.js`):

1. `require("express")`, `require("dotenv").config()` (`app.js:1-2`).
2. `require("./middleware/cors")` runs at require time and throws `ErrorResponse(... 500)` if `ALLOWED_ORIGINS` is unset (`middleware/cors.js:7-9`), so a missing variable kills the process before listen.
3. `require("./routes")` (`app.js:16`) loads all route, controller, service, repository and model modules. This is where the event emitters in `events/` register their listeners, because each file does `emitter.on(...)` at module scope (e.g. `events/SFTPEventEmitter.js:83`). Listeners therefore exist only if some loaded module requires the emitter file (the `userEventEmitter` is loaded via `controllers/admin.js:5`, `processLetterEmitter` via `controllers/transmissions.js:30`, `bulkHL7EventEmitter` via `controllers/hl7-job.js:5` and `controllers/v2/service.v2.controller.js:1`).
4. Module-scope side effects at require time: AWS SDK clients are constructed (`util/v2/sqs.v2.util.js:4`, `util/v2/s3.v2.util.js`, `services/lambda.js:12`, `util/v2/secret_manager/secretValue.js:7`); winston creates `logs/error.log` file transport (`logger/index.js:35-38`); `util/config.js` snapshots env into `config` once.
5. Express app built (`app.js:21-42`), then `startServer()` is called at require time (`app.js:61`): `await Promise.all([mongoConnect(), connectDb()])` then `app.listen(config.app.port || 3001)`. Any failure logs and `process.exit(1)` (`app.js:55-58`).
6. `mongoConnect` (native `mongodb` driver, `util/database.js:8-22`) and `connectDb` (mongoose, `database/index.js:8-23`) both read `DB_URI` from AWS Secrets Manager via `getSecretMangerValue` (secret ARN from env `AWS_SECRET_ARN`). That function swallows errors and returns `undefined` (`secretValue.js:30-32`), so a Secrets Manager failure surfaces as a destructuring `TypeError` and exit 1. The secret is cached forever in a module variable (`secretValue.js:15-18`): secret rotation needs a restart (observed).
7. The port opens only after both DB connections; there is no readiness distinction (`GET /health-check` returns `OK` without touching the DB, `routes/index.js:69-71`).

Two independent Mongo connections exist (mongoose pool and native `MongoClient`); see section 7.

## 2. Request flow and middleware order

`app.js:24-42`, in order: `trust proxy = 1`; `cors` (credentials true, origin allow-list from `ALLOWED_ORIGINS`, no-Origin requests allowed, disallowed origins get a 403 `ErrorResponse`); `app.options("*")`; `express.json()` (default body limit); `cookie-parser`; `morgan(config.app.environment)` (format string comes from env `APP_ENVIRONMENT`; value `unknown`); `compression({level:6})`; `routes`; catch-all `app.all("*")` -> 404 `ErrorResponse`; `errorHandler`.

Disabled in code: `cspMiddleware` (helmet) and `inputSanitizer` are imported/used only in comments (`app.js:8,11,23,30`); the files exist but are not applied globally (observed; `git grep` shows no other `use`).

Per-route middleware (not global): `authorize(roles, key)` (JWT + token-store check), `validate.body/query` (Joi, errors forwarded to `next`), legacy `schemaValidator` (sets `req.error`, does not reject), `multer` (S3 storage or memory), `express.text()` for the PostGrid webhook, `urlEncodedParser` for Twilio webhooks, `apiRateLimiter` on `/login`, OTP limiters on MFA routes, `authorizeEnv([...])`, `validateToken` (service token), `authorizeCognitoClient` + `authorizeCognitoScope` (M2M).

Typical v2 call: `routes/v2/<x>.v2.routes.js` -> `controllers/v2/<x>` (try/catch, `next(e)`) -> `services/v2/<x>` -> `repository/v2/<x>` -> `models/v2/<x>` (mongoose). Legacy v1: `routes/<x>.js` -> `controllers/<x>.js` -> `models/<x>.js` (raw driver via `getDb()`).

Error path (`middleware/errorHandler.js`, `util/v2/error.js`): any `next(err)` is mapped by `buildError` (Mongo dup key / "Cast to" -> 400, Joi `ValidationError` -> 400, JWT errors -> 401, otherwise `err.statusCode || 500`) and sent as `{type, data, error:true, message}` with the HTTP status. Success shape is not enforced centrally: v2 controllers mostly return `{type, message, data}` (+ `meta` for lists), legacy controllers return `{error:false, message, ...}` (`controllers/bodyTrace.js`, `controllers/auth.js:logout`).

## 3. Route mounting map (`routes/index.js`)

| Mount | Router | Note |
|---|---|---|
| `/health-check` | inline | public |
| `/accounts` | `v2/account.v2.routes` | |
| `/bodytrace` | `bodyTrace` | public, no `authorize` (device webhook) |
| `/` (root) | `auth` | `/login`, `/logout`, `/oauth/cognito` |
| `/admin` | `admin` | legacy users |
| `/v2/transmissions` | `v2/transmissions` | mounted twice (`:78` and `:97`); second mount is shadowed for any path the first handles |
| `/v2/transmission` | `v2/transmission.v2.routes` | singular and plural prefixes, different routers |
| `/v2/manual-upload`, `/v2/in-office` | upload routes | memory multer |
| `/v2/patient` | `v2/patient.v2.routes` | |
| `/v2/rpm`, `/v2/rpm/clinii` | rpm v2, clinii | clinii mounted after rpm under the same prefix |
| `/patient` | `patient` AND `rpm` | shared prefix (`:84-85`) |
| `/` (root) | `tasks` (`/task`, `/tasks/...`), `scheduling` (`/scheduling...`) | root-level legacy paths |
| `/user`, `/v2/user` | legacy and v2 user | |
| `/hl7job` (has `/v2/...` inside), `/v2/hl7job`, `/adt`, `/v2/adt` | HL7 | `/hl7job/v2/*` and `/v2/hl7job/*` are different routers |
| `/v2/archived-report`, `report-templates`, `report-note-sections`, `report-notes`, `report-note-suggestions`, `report-banners`, `device-groups`, `device`, `device-types`, `manufacturers`, `manufacturer-account`, `hospital`, `insurances`, `epic-users`, `billing-amount`, `benchmark-billing`, `dashboard`, `mfa`, `patient-communication-logs`, `letter-template`, `no-show-letter`, `twilio`, `user-activity-log`, `apiJob`, `sftp`, `alert-configurations`, `alert-protocol`, `referring-providers`, `service`, `live-call-tasks`, `zoom`, `quick-text-templates`, `patient-note-deletion-requests`, `notifications` | v2 routers | |
| `/csp`, `/cognito` | csp report, cognito | unversioned |

Unauthenticated routers (no `authorize` in the file): `routes/bodyTrace.js`, `v2/twilio.v2.routes.js`, `v2/zoom.v2.routes.js`, `v2/csp.v2.routes.js`. Other unauthenticated or non-JWT endpoints inside authorized files: `POST /v2/rpm/clinii/webhook-process` (shared header `code` vs secret key `CLINII_ACCESS_CODE`, `services/rpm/clinii/clinii.service.js:347`), `POST /v2/patient/update-document` (PostGrid; body is a JWT verified with secret key `WEBHOOK_SECRET`, `controllers/v2/patient.v2.controller.js:1007`), `GET /v2/user/validate-token`, `POST /cognito/verify`. Twilio webhook handlers show no signature validation (grep for `validateRequest`/`X-Twilio` found nothing): `unknown` whether enforced upstream (proxy/WAF not in repo).

## 4. Module and boundary map by area

| Area | Main files | Notes |
|---|---|---|
| Auth | `routes/auth.js`, `controllers/auth.js`, `services/v2/auth.v2.service.js`, `middleware/authorize.js`, `util/v2/token.v2.util.js`, `util/v2/cognito.v2.util.js`, `services/v2/otp/mfa` | bcrypt or Cognito credential check, optional OTP (MFA), JWT stored in `tokens` collection and set as httpOnly cookie `token`. |
| Patients | `services/v2/patient.v2.service.js` (4652 lines), `repository/v2/patient.v2.repository.js`, `util/v2/patient.v2.util.js`, `util/v2/patientFilter.js`, models `patients` (3 model files) | enroll, update, merge, billing schedule, reminders, notes, medications. |
| Transmission intake and reports | `routes/v2/transmission.v2.routes.js`, `transmissions.js`, `controllers/transmissions.js`, `services/transmissions.js` (`processReport`), `services/v2/transmission.v2.service.js` (1806), `repository/v2/transmission.v2.repository.js`, `services/v2/manual_upload.v2.service.js`, `services/v2/in_office.v2.service.js` | Reports are created here by manual upload, in-office upload, Clinii webhook, BodyTrace. The Python Lambda (`manufacturer-hl7-parser`) also writes `reports`, `patients`, `report_notes` into the same DB. This API only reads and edits what it ingested (no inbound hook from the Lambda found). |
| Reports and notes | `controllers/v2/notes*.js`, `services/v2/notes.v2.service.js`, `report_notes`, `report_note_sections`, `report_note_suggestions`, `alert_protocol` | clinic/evoke notes, signing, alert flags, note templates. |
| Cover page and PDF | `controllers/v2/coverPageGenerator.js`, `rpmCoverPageGenerator.js`, `util/v2/coverPageReport.v2.util.js`, `util/v2/pdf.v2.util.js`, `templates/cover-page/**`, `util/v2/coverPageTemplate.v2.util.js` | Puppeteer launches a new Chromium per PDF (`coverPageGenerator.js:122`), pdf-lib merges with the original PDF from S3. Per-account template chosen by DB value `account.settings.cover_page_template` and loaded with a dynamic `require` (falls back to default on error, `coverPageTemplate.v2.util.js:20-35`). Writes `${COVER_PAGE_PATH}/<reportId>.pdf` locally (`:697`) then uploads to S3 (`:785`). |
| Alerts and notifications | `services/v2/transmission.v2.service.js:622-690` (alert notification SQS), `notifications` collection (in-app, `services/v2/notifications.v2.service.js`), `util/v2/alert.v2.util.js` (Slack), `alert_configuration` | See section 5. |
| Billing and RPM | `services/v2/billing.v2.service.js`, `benchmark*.js`, `rpm.v2.service.js`, `services/rpm/clinii`, `util/v2/billingCode.v2.util.js`, `common/patient_billing_schedule_constant.js`, `billing_amount`, `billing_rules` | Benchmark billing system integration is via SQS events and a direct Benchmark HTTP API (insurances). |
| HL7 and EHR export | `services/v2/hl7job.service.js`, `services/hl7/*.js` (per client) + `strategies/`, `repository/v2/hl7Job.v2.repository.js`, SFTP (`events/SFTPEventEmitter.js`, `services/v2/sftp.v2.service.js`), API job (`apiJob.v2.service.js`) | This repo builds `hl7jobs` documents (ORU, DFT, IDCO) with patient/provider/ADT data and publishes `{hl7JobId}` to SNS; no HL7 message text is generated here (grep for `MSH` found none). The consumer that sends HL7 is outside the repo (`unknown`). |
| Devices and manufacturers | `device*`, `manufacturer*`, `util/v2/inOffice/<mfr>` parsers (Abbott `.log`, Biotronik `.xml`, Boston `.bnk`, Medtronic `.23x`), `pdfExtraction` | |
| Outreach and letters | `twilio.v2.service.js`, `services/lambda.js`, `util/v2/api/post_grid.v2.api.js`, `no_show_letter`, `letter_templates`, `live_call_task`, `services/scheduling.js` | Reminders are sent by an external Twilio Lambda (invoked for retries); this API ingests Twilio status callbacks. |
| Accounts and clinics | `account.v2.service.js`, `hospital`, `epic_users`, `report_banner`, `middleware/authorize.js` role preferences | `accounts.role_preferences` and `accounts.settings.*` flags drive behavior across the codebase. |

## 5. Async boundaries

In-process emitters (fire-and-forget; listener errors are caught and logged, nothing is retried or persisted, so a process restart loses pending work):

| Emitter / event | Emitted from | Effect |
|---|---|---|
| `eventEmitter` "log" (`middleware/activityLogger.js`) | controllers, services (about 60 sites) | upsert/push into `activity_logs` |
| `userLogEmitter` "logUserActivity" (`middleware/v2/userActivityLogger.js`) | about 100 sites | `$push` into `user_activity_logs` (stores `request.body` as `payload`). Note `quick_text_template.v2.controller.js` emits `"userActivityLog"`, which has no listener (observed: listener is only `logUserActivity`) |
| `automatedTaskEmitter` "createPatientTask" | `patient.v2.service.js:1759` | `createAutomatedTask` |
| `automatedBillingTaskEmitter` "syncPatientToBenchmark" | `patient.v2.service.js:1765` | Benchmark SQS `INSERT_PATIENT` |
| `cliniiTaskEmitter` "syncPatientToClinii" | `patient.v2.service.js:1770` | Clinii API + `patients.clinii` update; non-prod forces account `Demo` |
| `cardioOneEventEmitter` "fetchRhythmId" | `patient.v2.service.js:1775,2449` | `cardio_one_api_logs` upsert + CardioOne SQS |
| `patientEventEmitter` "nameUpdate"/"physicianUpdate" | `patient.v2.service.js:2464,2478`, `transmission.v2.service.js:1776` | updates `tasks`, `reports.assignedUser` |
| `userEventEmitter` "nameUpdate" | `controllers/admin.js:387,485` | denormalized name updates in reports, accounts, patients, report_assignments |
| `processLetterEmitter` "processLetter" | `services/transmissions.js:116`, `controllers/transmissions.js:496` | PostGrid letter generation per report |
| `bulkHL7EventEmitter` "bulkHL7" | `controllers/hl7-job.js:186`, `controllers/v2/service.v2.controller.js:11` | sequential HL7 job creation per report |
| `sftpEventEmitter` "sftpExportEvent" | `services/transmissions.js:426` | cover page, `sftp_jobs` upsert, SQS publish |

Queue/topic/function sends (names are env vars; values `unknown`, defined outside the repo):

| Target | Env var name | Producer | Payload shape (observed) | Failure handling |
|---|---|---|---|---|
| SQS benchmark | `AWS_BENCHMARK_QUEUE_URL` | patient, transmission services, `events/billingTaskEmitter.js` | `{eventType: INSERT_PATIENT\|UPDATE_PATIENT\|CHARGE_EXPORT, payload:{patientId}\|{reportId}}` (camelCase) | `benchmark.v2.service.js` swallows and logs; callers do not await |
| SQS alert notification | `AWS_ALERT_NOTIFICATION_QUEUE_URL` | `transmission.v2.service.js:660` | `{env, alert_type, recipients, message_content, notification_method, report_id, account, alert_sender, client_url, s3_bucket?, has_attachment?, report_file_path?, report_cover_page_path?, slack_channels?}` | awaited; response status summarized in the HTTP message |
| SQS CardioOne | `AWS_CARDIO_ONE_QUEUE_URL` | `cardioOneEventEmitter` | `{eventType:"fetchRhythmId", payload:{jobId}}` | log status set `failed` on error |
| SQS SFTP | `AWS_SFTP_QUEUE_URL` | `SFTPEventEmitter` | `{payload:{jobId}}` | job set `failed` |
| SQS Intergy/API job | `AWS_INTERGY_QUEUE_URL` | `apiJob.v2.service.js:23` | `{event_type:"JOB_PROCESSING", event_payload:{job_id}}` (snake_case) | thrown to caller |
| SQS bot | `AWS_BOT_QUEUE_URL` | `services/sqs.js` via `updateNextSendInManufacturer` | `{eventType:"BOT_EVENT_TRIGGER", value:<patientId>}` | 3 retries with 2-3 s sleeps inside the request context, logged in `nextSendUpdate_log`; only when `NODE_ENV=prod` |
| SNS HL7 job | `AWS_SNS_HL7JOB_TOPIC_ARN`, `AWS_SNS_HL7JOB_TOPIC_REGION` | `hl7job.service.js:166` | `{hl7JobId}` + message attribute `account` | job and report marked `error` |
| Lambda twilio | `AWS_LAMBDA_FUNCTION_NAME_TWILIO` (region `AWS_LAMBDA_REGION`, default `us-east-2`) | `twilio.v2.service.js:187` | `{TYPE:"retry_by_next_contact_number", retryPatients:[{patientId, existingLogId}]}`; sync invoke | silently skipped if env unset |
| Lambda bot (deprecated) | `AWS_LAMBDA_FUNCTION_NAME_BOT` | `patient.v2.service.js:1211` (`GET_DISCONNECTED_MONITORS`, response parsed) | sync invoke | thrown |

Every SQS send uses `DelaySeconds = SQS_DELAY_SECONDS` (10, `common/constant.js:331`). Some benchmark publishes are not awaited and swallow errors, so a lost message is only visible in logs. Message-delivery guarantees, DLQs and consumers: `unknown` (no IaC in repo).

Scheduled/background work: none inside this process. Periodic jobs that touch the same data (reminders, next-send updates, billing schedules) run in other services `[inferred]` from the Lambda invocations and SQS producers above.

## 6. External integrations

AWS S3 (reports, cover pages, uploads, SFTP staging; bucket env `AWS_S3_BUCKET`, hard-coded fallback name in `s3.v2.util.js:20`), SES (OTP, password reset, notes; credential env names `AWS_SES_ACCESS_KEY`, `AWS_SES_SECRET_KEY`, `AWS_SES_REGION`), SNS, SQS, Lambda, Secrets Manager, Cognito (user pool login, SSO providers, M2M clients; secrets via `cognitoSecret.js`), Twilio (SMS/voice/lookup; secret keys `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`), PostGrid (letters, address verification, secret keys `POST_GRID_*`), Slack incoming webhooks (secret keys `EHR_SLACK_WEBHOOK_URL`, `MERGE_PATIENT_SLACK_WEBHOOK_URL`, `PATIENT_NOTE_DELETE_REQUEST_SLACK_WEBHOOK_URL`, `TWILIO_OPT_OUT_SLACK_WEBHOOK_URL`), Clinii (REST, access code auth), CardioOne/Rhythm (Cognito client-credentials token cached in memory), Benchmark billing REST (secret keys `API_BASE_URL_BENCHMARK`, `API_USERNAME_BENCHMARK`, `API_PASSWORD_BENCHMARK`; token cached in `benchmark_tokens`), Zoom (webhook, signature check skipped when `NODE_ENV=local`).

## 7. Persistence boundaries

- Mongoose models (`models/v2`, 74 files) plus the native driver (`util/database.getDb()`) used by legacy `models/*.js`, some repositories (`clinic_signature_updates`, `patient.v2.repository`, `controllers/patient.js`, `controllers/v2/notes.js`). The same collection is mapped by several model files: `patients` (`models/patient.js`, `models/v2/patient.js`, `models/v2/patient.v2.model.js`), `reports` (`models/report.js`, `models/v2/report.js`, `models/v2/Report.v2.model.js`), `users` (`models/user.js`, `models/v2/users.v2.model.js`).
- Transactions: the only one is `database/index.js:runTransaction` (mongoose session), used by `patient.v2.repository.mergePatientTransaction` (`:1929`). Inside it the writes go through `db().collection(...)` of the separate native `MongoClient` with `{session}` from the mongoose client. Whether the driver accepts a session from a different client and whether the merge is truly atomic is `unknown` (not tested here; check driver 4.x behavior and `tests/` for coverage). The merge touches `reports`, `patient_communication_log`, `report_assignments`, `bp_readings_histories`, `bt_measurements`, `patient_analytics`, `patient_diagnoses`, `patient_document`, `patient_medication`, `patient_notes`, `patient_notes_history`, `alert_metadata` (collection written by the Lambda, no model here), `patients` (`patient.v2.service.js:3610-3700`).
- All other multi-document flows (manual upload sequence, process-report, HL7 job creation) are sequences of independent writes with no rollback (manual upload deletes the S3 object on error but not DB rows, `manual_upload.v2.service.js:967-1020`).
- Collections shared with other Evoke services: see `change-impact.md`.
- Local disk: `COVER_PAGE_PATH`, `PATIENT_CONNECTIVITY_REPORT_PATH` for generated PDFs; `logs/error.log`.

## 8. Auth boundary

- JWT (secret key `JWT_SECRET`, expiry from user or `JWT_EXPIRATION_TIME`) with claims `name, email, userId, role, accounts, loginBy, provider` (`token.v2.util.js:87-101`), stored in `tokens`; presented as cookie `token` (`secure` and `SameSite=None` unless `NODE_ENV=local`, `common.util.js:329`) or `Authorization: Bearer`.
- `authorize` (`middleware/authorize.js`): token must exist in `tokens`, verify JWT, load user, set `req.user` (role comes from the token, not the DB), then role check. Optional per-account override: with header `Account` and a key like `transmission_report.nurse_flag`, roles come from `accounts.role_preferences` mapped by `common/userRoleConstant.js` (no mapping for `clinicReviewer` or `rpmUser`). An empty role list means any authenticated user.
- Account scoping is done in services using `req.user.accounts`, not by middleware (e.g. `sftp.v2.service.js:25`): each endpoint is responsible.
- Service tokens: `validateToken` (`authorizeService.js`) verifies the same `JWT_SECRET` and then acts as the user named by env `EVOKE_AUTOMATED_NOTES_USER` (default `EVOKE AUTOMATED NOTES`); used on `POST /v2/service/export-to-ehr` and `POST /v2/patient/no-show-patients/process-connectivity-report`.
- Cognito M2M (`authorizeCognitoClient` + `authorizeCognitoScope`) guards SSO profile lookup for external clients.
- Rate limits: `/login` (10 failures per 15 min per default key), OTP routes (5-10 per 5 min); limiters are in-memory per process, so they do not coordinate across replicas `[inferred]`.

## 9. Failure handling

- Controllers wrap in try/catch and call `next`; unhandled async rejections elsewhere (e.g. fire-and-forget `.then` chains) are only caught where `.catch` is written. No process-level handler: an unhandled rejection in Node 24 terminates the process `[inferred from Node default]`.
- Emitter and SQS failures are logged only (section 5). HL7 job publish failure marks the job `error`; HL7 failures also alert Slack (`sendEhrAlertToSlack`).
- `errorHandler` calls `next()` after responding (harmless: headers already sent).
- Secrets Manager failure returns `undefined` (section 1); later code that reads `secret.X` throws a `TypeError` surfaced as 500.
- Legacy `controllers/bodyTrace.js` runs unawaited saves after responding 200, so DB errors are not reported to the caller (observed).
- Puppeteer: a failed `page.goto/pdf` leaves the browser unclosed in `html_to_pdf` (`coverPageGenerator.js:120-130` has no try/finally). Concurrency limit on Chromium launches: none found.
- In-office parsing builds `RegExp` from uploaded file names (`in_office.v2.service.js:25-27`) without escaping (regex injection / ReDoS surface).

## 10. Environment-dependent behavior (`config.env`, default `local`; values seen: `local`, `pre`, `qa`, `prod`)

| Check | Effect |
|---|---|
| `NODE_ENV=prod` and next-send change | calls `updateNextSendInManufacturer` (SQS bot) (`models/v2/patient.js:429`, `patient.v2.service.js:696`) |
| `!= prod` | Clinii patient sync forces account `Demo` (`events/cliniiTaskEmitter.js:17`); Clinii facility list is `["Demo"]` (`clinii.service.js:81`); `prod` refuses `Demo` webhooks (`:363`) |
| not `prod`/`pre` | disconnected-monitor and no-show master list downloads return 403 (`patient.v2.controller.js:918,948`) |
| `authorizeEnv(["pre","qa"])` | `/v2/patient/automation/*` test helper routes (`patient.v2.routes.js:348-360`), including enroll and delete |
| `local` | Puppeteer uses `LOCAL_CHROME_PATH`; cookies not secure; Zoom signature check skipped; logger level debug |
| value sent in SQS alert payload | `env: config.env` to the alert consumer |

## Diagram

```
 Browser (portal front end)            External webhooks: BodyTrace, Twilio, PostGrid, Zoom, Clinii
        |  cookie token / Bearer                    |  (mostly unauthenticated or shared-secret)
        v                                           v
  Express app.js: cors -> json -> cookies -> morgan -> compression -> routes/index.js -> 404 -> errorHandler
        |
   routes/v2 -> controllers/v2 -> services/v2 -> repository/v2 -> models/v2 (mongoose) ----+
        |            |                |                                                       |
        |            |                +-- util/v2: S3 SES SNS SQS Twilio PostGrid Cognito     v
        |            |                    Clinii CardioOne Benchmark Slack Puppeteer/pdf-lib  MongoDB (shared DB)
        |            +-- emit --> events/* in-process EventEmitters (log, tasks, SFTP, HL7, letters) ^
        |                                                                                          |
        +--> SQS: benchmark, alert-notification, cardio-one, sftp, intergy, bot ---> external consumers
        +--> SNS hl7 job topic -----------------------------------------------------> external HL7 sender
        +--> Lambda: twilio retries (sync), bot (deprecated)                  Python Lambda manufacturer-hl7-parser
                                                                              writes patients/reports/report_notes ----+
```

## Unknowns

Consumers of every queue/topic/Lambda, queue redrive and delay settings, IAM, Kubernetes and ingress (WAF, Twilio signature enforcement), replica count, real indexes, whether `mergePatientTransaction` is atomic across the two clients, value of `APP_ENVIRONMENT` and `NODE_ENV` in each environment, `Dockerfile` details (taken from `overview.md`), `middleware/v2/urlEncodedParser.js` (not read). Checked: repo tracked files only; no IaC present.
