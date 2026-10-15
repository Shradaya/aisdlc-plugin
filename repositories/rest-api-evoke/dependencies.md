---
repository: rest-api-evoke
analyzed_commit: 84768b56f78a3663d6cfb9acf128556c4cdab89f
analyzed_at: 2026-10-15T08:40:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [package.json, yarn.lock, Dockerfile, bitbucket-pipelines.yml, .env.example, util/config.js, util/database.js, database/index.js, util/v2/s3.v2.util.js, util/v2/ses.v2.util.js, util/v2/sns.v2.util.js, util/v2/sqs.v2.util.js, util/v2/slack.v2.util.js, util/v2/alert.v2.util.js, services/lambda.js, services/sqs.js, util/v2/secret_manager/*.js, util/v2/api/post_grid.v2.api.js, util/v2/cardioOne/cardioOneApi.js, util/v2/clinii/cliniiApi.js, services/v2/benchmark-token.v2.service.js, services/v2/insurance.v2.service.js, events/*.js, services/v2/hl7job.service.js, package.json (diff 4178ce4..84768b5), services/updateNextSendInManufacturer.js, models/v2/account_document.v2.model.js, services/v2/account_document.v2.service.js, controllers/admin.js]
---

# Dependencies (Phase D)

## Packages (`package.json`, caret ranges; resolved versions from `yarn.lock`)

Runtime (observed): AWS SDK v3 clients `@aws-sdk/client-{cognito-identity-provider,lambda,s3,secrets-manager,ses,sns,sqs}` and `s3-request-presigner` (^3.1129.0, S3 resolved 3.1129.0); `express` ^4.17.1 (4.22.2), `mongoose` ^6.12.6 (6.13.11), `mongodb` ^4.0.0 (4.17.2; refresh 2026-10-15: `package.json` is unchanged between 4178ce4 and 84768b5 (`git diff` empty), so no package added, removed or bumped; commit 115ae4182 EL-5638 "Phase 3" moves more models from the native driver to Mongoose (new `*.v2.model.js` for activity_log, clinic_signature_updates, report_cover_page), the native `getDb()` path still exists for remaining legacy models; yarn.lock also holds a 7.6.0 entry, probably transitive of a dev package, unverified), `@hapi/joi` ^17, `express-validator` ^6 (legacy), `axios` ^1.20, `twilio` ^4.20 (4.23.0), `puppeteer` ^25.10 (25.10.0), `pdf-lib`, `pdfjs-dist` ^4.10 (PDF text extraction), `exceljs`, `archiver` ^4, `handlebars`, `multer` ^2.3 + `multer-s3`, `jsonwebtoken`, `jwks-rsa`, `bcryptjs`, `crypto-js`, `otplib`, `helmet`, `cors`, `compression`, `cookie-parser`, `morgan`, `express-rate-limit`, `winston`, `moment`, `moment-timezone`, `lodash`, `dotenv` ^10, `@xmldom/xmldom`.
Dev: `mocha` 11, `chai` 6, `chai-as-promised`, `sinon` 22, `sinon-chai`, `proxyquire`, `aws-sdk-mock`, `mongodb-memory-server`, `nyc`, `eslint` 10 + prettier plugins, `husky`, `lint-staged`, `nodemon`, `mocha-junit-reporter`.
Unused or suspicious (inferred from imports, not exhaustively verified): `.env.example` lists `MONGO_DB_HOST`, `SG_MAIL_TOKEN`, `SG_MAIL_SENDER_EMAIL`, `BUCKET`, `REGION`, `AWS_CARDIO_ONE_QUEUE_URL`; `util/config.js` reads none of the first five (it reads `AWS_S3_BUCKET`, `AWS_REGION`, ...), so the example file is stale. SendGrid is not imported anywhere (grep for `sendgrid` import found nothing).

## Package manager, Node, OS packages

- `yarn.lock` (v1) is tracked and used by the `Dockerfile` (`yarn install --production --frozen-lockfile`) and by Bitbucket PR pipelines (`yarn install`, `yarn lint`, `yarn test:ci`, `bitbucket-pipelines.yml:12-31`). `package-lock.json` is gitignored (`.gitignore:17`). Branch pipelines build the image only; they do not run tests.
- Node 24: `Dockerfile` `node:24-slim` (both stages), `bitbucket-pipelines.yml:1` `node:24`. No `engines` field, no `.nvmrc` tracked.
- Docker runtime stage apt packages: `chromium`, `fonts-ipafont-gothic`, `fonts-wqy-zenhei`, `fonts-thai-tlwg`, `fonts-kacst`, `fonts-freefont-ttf`, `libxss1`; symlink `google-chrome-stable`; `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`, `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` (`Dockerfile:19-26`). Puppeteer launches `--no-sandbox` (`util/config.js:93-107`).
- Rendered HTML (cover pages) loads `cdn.jsdelivr.net` (chart.js) and Google Fonts at PDF-render time (`util/v2/coverPageReport.v2.util.js:114-116,672`, `util/constants.js:267-269`): an outbound runtime dependency of PDF generation.

## Configuration sources (names only)

Two layers (observed): process env via `util/config.js`, and a JSON secret in AWS Secrets Manager read by `util/v2/secret_manager/secretValue.js` (`AWS_SECRET_ARN`, region `AWS_REGION`; cached in memory).
Env names: `NODE_ENV` (`local`|`prod`|other; `pre`,`qa` used by `authorizeEnv`), `APP_PORT`, `APP_ENVIRONMENT`, `CLIENT_URL`, `ALLOWED_ORIGINS` (required; startup throws without it, `middleware/cors.js:9`), `EVOKE_AUTOMATED_NOTES_USER`, `MONGO_DB_TIME_OUT`, `JWT_SECRET`, `JWT_EXPIRATION_TIME`, `CRYPTO_SECRET`, `COVER_PAGE_PATH`, `PATIENT_CONNECTIVITY_REPORT_PATH`, `PASS_MAIL_SENDER`, `NOREPLY_MAIL_SENDER`, `OTP_MAIL_SENDER`, `AWS_REGION`, `AWS_SECRET_ARN`, `AWS_BOT_SECRET_ARN`, `AWS_S3_BUCKET`, `AWS_SES_ACCESS_KEY`, `AWS_SES_SECRET_KEY`, `AWS_SES_REGION`, `AWS_BENCHMARK_QUEUE_URL`, `AWS_INTERGY_QUEUE_URL`, `AWS_ALERT_NOTIFICATION_QUEUE_URL`, `AWS_CARDIO_ONE_QUEUE_URL`, `AWS_SFTP_QUEUE_URL`, `AWS_BOT_QUEUE_URL`, `AWS_LAMBDA_FUNCTION_NAME_TWILIO`, `AWS_LAMBDA_FUNCTION_NAME_BOT`, `AWS_LAMBDA_REGION` (default us-east-2), `AWS_SNS_HL7JOB_TOPIC_ARN`, `AWS_SNS_HL7JOB_TOPIC_REGION`, `POST_GRID_*` and `WEBHOOK_SECRET` (env copies in config; code actually reads the secret copies), `CSP_REPORT_URI`, `CSP_REPORT_ONLY`, `LOCAL_CHROME_PATH`, `PUPPETEER_EXECUTABLE_PATH`. `JWT_SECRET`/`CRYPTO_SECRET`/`CLIENT_URL` exist in both layers; the code paths read the Secrets Manager copy (`middleware/authorize.js:35-39`, `services/v2/user.v2.service.js:73-157`), the env copy is read in `config.jwt`/`config.crypto` (usage of those not traced: `unknown`).
Secret-manager key names: `DB_URI`, `JWT_SECRET`, `JWT_EXPIRATION_TIME`, `CRYPTO_SECRET`, `CLIENT_URL`, `BOT_SECRET_KEY` (comma-separated crypto+jwt pair), `WEBHOOK_SECRET` (PostGrid webhook JWT), `POST_GRID_BASE_API`, `POST_GRID_PRINT_MAIL_API_KEY`, `POST_GRID_ADDRESS_VERIFICATION_API_KEY`, `POST_GRID_SENDER_CONTACT_ID`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_OPT_OUT_SLACK_WEBHOOK_URL`, `EHR_SLACK_WEBHOOK_URL`, `MERGE_PATIENT_SLACK_WEBHOOK_URL`, `PATIENT_NOTE_DELETE_REQUEST_SLACK_WEBHOOK_URL`, `CLINII_BASE_URL`, `CLINII_CLIENT_ID`, `CLINII_ACCESS_CODE`, `API_BASE_URL_BENCHMARK`, `API_USERNAME_BENCHMARK`, `API_PASSWORD_BENCHMARK`, `ZOOM_WEBHOOK_SECRET_TOKEN`, `ZOOM_ENABLE_CALL_LOGGING`, `AWS_COGNITO_{USER_POOL_ID,CLIENT_ID,ISSUER,CLIENT_SECRET,REDIRECT_URI,M2M_RHYTHM_CLIENT_ID}`, `SSO_RHYTHM_{ISSUER,CLIENT_ID,REDIRECT_URI,LOGOUT_URI,ERROR_REDIRECT_URI,API_BASE_URL,AUTH_BASE_URL,AUTH_CLIENT_ID,AUTH_CLIENT_SECRET}` (`util/v2/secret_manager/cognitoSecret.js`).

## AWS services

| Service | Use | Config names | Evidence |
|---|---|---|---|
| S3 | Single shared bucket (default literal fallback name in code when env unset): report PDFs read by `file_path`/`hf_file_path`, uploads (`Documents/`, `ManualUploads/`, `account-documents/<account-name-lowercased-dashed>/{alert-protocol,clinic-protocol}.pdf` (new, EL-5597), `Clinii-Reports/rpm/`, `coverpages/`, `patient_letters/`, `connectivityReport/`, `accounts_logo/`, `provider_signatures/`, `invoices/`, `csp-violations/`, `sftp/`), reads `adts/<file>`; presigned GET URLs | `AWS_S3_BUCKET`, `AWS_REGION` | `util/v2/s3.v2.util.js`, `common/constant.js:322` |
| SQS | Send only (no consumer in this repo), delay 10s | `AWS_BENCHMARK_QUEUE_URL`, `AWS_INTERGY_QUEUE_URL`, `AWS_ALERT_NOTIFICATION_QUEUE_URL`, `AWS_CARDIO_ONE_QUEUE_URL`, `AWS_SFTP_QUEUE_URL`, `AWS_BOT_QUEUE_URL` | `util/v2/sqs.v2.util.js`, `common/constant.js:331` |
| SNS | Publish HL7 job ids with `account` message attribute | `AWS_SNS_HL7JOB_TOPIC_ARN`, `AWS_SNS_HL7JOB_TOPIC_REGION` | `services/v2/hl7job.service.js:164-176` |
| SES | Emails: OTP, password reset, no-show letter | `AWS_SES_*`, `OTP_MAIL_SENDER`, `PASS_MAIL_SENDER`, `NOREPLY_MAIL_SENDER` | `util/v2/ses.v2.util.js` |
| Lambda | Sync invoke: reminders-retry (Twilio) and disconnected-monitors bot | `AWS_LAMBDA_FUNCTION_NAME_TWILIO`, `AWS_LAMBDA_FUNCTION_NAME_BOT`, `AWS_LAMBDA_REGION` | `services/lambda.js` |
| Secrets Manager | Configuration (above) | `AWS_SECRET_ARN`, `AWS_BOT_SECRET_ARN` (the latter never read in code found: `unknown`) | `secretValue.js` |
| Cognito (IdP) | Admin create/set-password/auth/sign-out, list users; OIDC token/userinfo via axios; JWKS | secret keys above | `util/v2/cognito.v2.util.js` |
| ECR/EKS (CI only) | Image push, Kustomize tag bump in `eks-yml-manifest` repo (path `evoke-app-manifest/emc-portal/overlays/{dev,qa,pre-prod,prod}`) | `AWS_ROLE_ARN`, `BE_ECR_REGISTRY`, `BE_IMAGE`, `MANIFEST_REPO_SSH_KEY` | `bitbucket-pipelines.yml` |

## Third-party HTTP APIs

| Service | Use | Evidence |
|---|---|---|
| Twilio | Lookups v2 (line type), fetch message/call status; inbound SMS/status webhooks. SMS/call sending itself is not in this repo (done by the reminders Lambda, inferred) | `util/v2/twilio.v2.util.js`, `services/v2/twilio.v2.service.js:102-104` |
| PostGrid | Create/cancel print-mail letters, address verification (`print-mail/v1/letters`, `v1/addver/verifications`), webhook back | `util/v2/api/post_grid.v2.api.js`, `util/v2/endpoint.v2.js` |
| Slack incoming webhooks | EHR job failures, patient merge, note-delete requests, SMS opt-out | `util/v2/alert.v2.util.js`, `services/v2/twilio.v2.service.js:230` |
| Zoom Phone | Inbound webhook (HMAC verified) logs live calls | `services/v2/zoom.v2.service.js` |
| Clinii (RPM) | Auth by access code, users, facilities, patients, report files; inbound webhook | `util/v2/clinii/*.js`, `services/rpm/clinii/clinii.service.js` |
| CardioOne / Rhythm | OAuth2 client-credentials, `GET /v1/users?email=..&partner=evoke` (SSO user lookup); Cognito-based SSO | `util/v2/cardioOne/*.js`, `services/v2/cognito.v2.service.js:34` |
| Benchmark (billing system) | Password-grant token (cached in `benchmark_tokens`), `GET api/Patients/GetByAccountNumber` for insurance | `services/v2/benchmark-token.v2.service.js`, `services/v2/insurance.v2.service.js` |
| BodyTrace | Inbound webhooks only (`/bodytrace/bp`, `/bodytrace/weight`) | `routes/bodyTrace.js` |
| SFTP | No SFTP client or `ssh2` dependency here; export is a Mongo `sftp_jobs` record plus SQS message (strategy "SFTP Client"), the consumer is external. Legacy path writes the PDF to S3 `sftp/...` | `events/SFTPEventEmitter.js`, `services/v2/sftp.v2.service.js` |

## Databases

MongoDB only. URI from secret key `DB_URI`; connected twice at start: native driver (`util/database.js:8-22`, `getDb()` used by legacy models) and Mongoose (`database/index.js`, `runTransaction` implies replica set: `unknown`). Models in `models/v2` (about 74 plus the new `account_documents` collection, unique index on `account_id`, `models/v2/account_document.v2.model.js`), shared with the HL7 parser (see edges). `patients.insurance` (three insurance sub-documents) gained optional `authorization_code`, `treatment_start`, `treatment_end` (EL-5602, additive; `models/v2/patient.v2.model.js`). Database name comes from the URI.

## Code-level references to other services (candidate edges)

None of these targets is registered; except the parser, all are `target_registered:false`.

| # | Edge | Direction | Evidence | Status |
|---|---|---|---|---|
| 1 | rest-api-evoke <-> `manufacturer-hl7-parser` (REGISTERED) via shared MongoDB: the parser inserts `reports` (`file_path`, `hf_file_path`, `hl7_file_path`, `summary_report_flag`, `oruControlId`), `patients`, `report_notes`, `tasks`, `cardio_one_api_logs`; this API reads/updates the same collections and shares the `sequencers` counter (repository/v2/sequencer.v2.repository.js used by `patient.v2.repository.js:33`, name key unverified) | read-write both ways | `util/v2/report.v2.util.js:131`, `util/v2/pdf.v2.util.js:82`, `models/v2/sequencers.v2.model.js`, parser `data-model.md` | observed (code side) |
| 2 | Same edge via S3: parser writes PDFs under `<manufacturer>/<clinic>/<date>/`, API streams them with `getFileStreamFromS3(file_path)` from bucket `AWS_S3_BUCKET` (equality with the parser's `PROCESSED_BUCKET` is `unknown`, name values not read) | parser -> API | `util/v2/s3.v2.util.js:50`, parser `interfaces.md` | inferred |
| 3 | API -> Benchmark SQS consumer: `{eventType: INSERT_PATIENT\|UPDATE_PATIENT\|CHARGE_EXPORT, payload}`; parser sends `CREATE_PATIENT` to the same kind of queue | API -> consumer | `services/v2/benchmark.v2.service.js`, `patient.v2.service.js:1946,2454,4131`, `services/transmissions.js:158`, `controllers/patient.js:113`, `events/billingTaskEmitter.js:18` | observed |
| 4 | API -> CardioOne SQS consumer: `{eventType:"FETCH_RHYTHM_ID", payload:{jobId}}`; parser sends `{event_type, payload:{job_id}}` (key spelling differs; whether one consumer accepts both: `unknown`) | API -> consumer | `events/cardioOneEventEmitter.js:162` | observed |
| 5 | API -> HL7 EHR export consumer via SNS topic (`{hl7JobId}`, attribute `account`), job documents in `hl7jobs` | API -> consumer | `services/v2/hl7job.service.js:164-176` | observed; consumer repo `unknown` |
| 6 | API -> Intergy/API-job consumer via SQS `AWS_INTERGY_QUEUE_URL`: `{event_type:"JOB_PROCESSING", event_payload:{job_id}}` | API -> consumer | `services/v2/apiJob.v2.service.js:22-26` | observed |
| 7 | API -> SFTP export consumer via SQS `AWS_SFTP_QUEUE_URL`: `{payload:{jobId}}` | API -> consumer | `events/SFTPEventEmitter.js:12-20` | observed |
| 8 | API -> alert-notification worker via SQS `AWS_ALERT_NOTIFICATION_QUEUE_URL` (email/Slack/SMS alert payload, see interfaces.md) | API -> consumer | `services/v2/transmission.v2.service.js:610-661` | observed |
| 9 | API -> crawler bot via SQS (since EL-5444 the next-send update is sent only when the patient is not `information.in_office_only` and an active `manufacturer_accounts` record exists for the patient manufacturer and account; `services/updateNextSendInManufacturer.js:16-28`; the module now exports an object `{updateNextSendInManufacturer, isPatientEligibleForManufacturerUpdate}`) `AWS_BOT_QUEUE_URL`: `{eventType:"BOT_EVENT_TRIGGER", value:<patientId>}` (next-send update on manufacturer portals); and sync Lambda invoke `AWS_LAMBDA_FUNCTION_NAME_BOT` with `{eventType:"GET_DISCONNECTED_MONITORS", manufacturer, account}` (code comment marks the Lambda path DEPRECATED but `getDisconnectedMonitors` still calls it) | API -> bot | `services/sqs.js`, `services/updateNextSendInManufacturer.js:247`, `services/lambda.js:16-33`, `patient.v2.service.js:1204-1211` | observed |
| 10 | API -> reminders Lambda (`AWS_LAMBDA_FUNCTION_NAME_TWILIO`): `{TYPE:"retry_by_next_contact_number", retryPatients:[{patientId, existingLogId}]}` after a failed Twilio status | API -> consumer | `services/v2/twilio.v2.service.js:187-190` | observed |
| 11 | Twilio, PostGrid, Zoom, Clinii, BodyTrace -> API webhooks (see interfaces.md); Lambda/automation callers of `/v2/service/export-to-ehr` and `/v2/patient/no-show-patients/process-connectivity-report` with a service JWT (caller identity `unknown`) | external -> API | `routes/v2/service.v2.routes.js`, `routes/v2/patient.v2.routes.js:73` | observed |
| 12 | Front end (`evoke-portal-front-end`, per `esdlc` agent docs; not registered) -> API | front end -> API | `middleware/cors.js`, `ALLOWED_ORIGINS` | inferred |
| 13 | Rhythm/CardioOne SSO: Cognito M2M clients call `POST /v2/user/sso/profile` | external -> API | `routes/v2/user.v2.routes.js:19-26` | observed |
| 15 | Deactivation (`PUT /admin/user/deactivate`) now deletes all `tokens` for the user (`tokenRepository.deleteTokensByUserId`, EL-5580); front end must handle 401 with `data.code` (see interfaces.md) | API -> front end | `controllers/admin.js:681-684`, `middleware/authorize.js` | observed |
| 14 | CI -> `eks-yml-manifest` Bitbucket repo (Kustomize image tag bump) | CI -> manifest repo | `bitbucket-pipelines.yml:70-101` | observed |

## Refresh 2026-10-15 (4178ce4..84768b5)

No package, Dockerfile or pipeline change (only `package.json` checked by diff; `yarn.lock` and `bitbucket-pipelines.yml` are not in the changed-file list). New storage usage: S3 prefix `account-documents/` (same bucket). Twilio: `updateSmsOrVoiceLog` now catches a failed Twilio API fetch and falls back to webhook status (EL-5649), no new dependency. Cognito/SSO: sign-in and SSO profile now refuse blocked users (403). The parser `patients` collection gained optional insurance fields; nothing the parser writes was removed, so no breaking change was found for `manufacturer-hl7-parser`. No changed file references the portal front end, the billing-schedule repository or the Client EMR parser; the front end is affected only through the HTTP contract (interfaces.md); for the other two: `unknown`, no code reference found in the diff.

## Unknowns

IAM roles, queue/topic/bucket values, Kubernetes manifests (`eks-yml-manifest` is a sibling repo, not read), consumers' repositories and owners, whether the `lambda` bot path is still deployed. Checked: repo root, `Dockerfile`, pipeline, config files.
