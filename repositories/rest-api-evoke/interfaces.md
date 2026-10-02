---
repository: rest-api-evoke
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [routes/index.js, routes/*.js, routes/v2/*.js, middleware/authorize.js, middleware/authorizeService.js, middleware/authorizeCognitoClient.js, middleware/authorizeCognitoScope.js, middleware/rateLimiter.js, middleware/cors.js, middleware/errorHandler.js, util/v2/error.js, util/v2/validate.v2.util.js, events/*.js, services/v2/hl7job.service.js, services/hl7/strategies/*.js, services/v2/zoom.v2.service.js, services/rpm/clinii/clinii.service.js, services/v2/twilio.v2.service.js, controllers/v2/patient.v2.controller.js]
---

# Interfaces (Phase E)

Route data was extracted statically from the route files (every `router|routes.<method>` call). Controller names are the exported function in `controllers/` (v2 unless noted). The handler named in each row is the last argument of the route. Validators are Joi unless noted. Role codes: A Admin, AS Assistant, U User, C Clinic, CR ClinicReviewer, P Physician, CA ClinicAdmin, R RPMUser. Set `S7` = A,AS,U,C,CR,P,CA. `authz(roles[,key])` = `middleware/authorize.js`: bearer token from cookie `token` or `Authorization: Bearer`, token must also exist in the `tokens` collection, JWT verified with the Secrets Manager `JWT_SECRET`, user loaded; if an `account` request header and a key such as `manual_upload.report_upload` are given, the account's `role_preferences` may replace the role list (`authorize.js:63-78`). No roles given = any authenticated user.

## Inbound HTTP surface

Server: Express, JSON body, cookies, CORS allow-list from `ALLOWED_ORIGINS` (credentials true; allowed headers include `Account`, `X-ZM-Signature`, `X-ZM-Request-Timestamp`), `trust proxy 1`, gzip. 404 catch-all and `errorHandler`. No global auth: each route attaches its own. CSP and input sanitizer middleware exist but are commented out in `app.js:8,11,23,30`.

### Prefixes mounted in `routes/index.js`

`/health-check`; `/accounts`; `/bodytrace`; (root: auth routes); `/admin`; `/v2/transmissions` (mounted twice, `:78` and `:97`, same router); `/v2/transmission`; `/v2/manual-upload`; `/v2/patient`; `/v2/rpm`; `/v2/rpm/clinii`; `/patient` (two routers: `routes/patient.js` and `routes/rpm.js`); root-mounted `routes/tasks.js` and `routes/scheduling.js`; `/user`; `/v2/user`; `/hl7job`; `/v2/hl7job`; `/adt`; `/v2/archived-report`; `/v2/report-templates`; `/v2/report-note-sections`; `/v2/device-groups`; `/v2/report-banners`; `/v2/dashboard`; `/v2/billing-amount`; `/v2/mfa`; `/v2/patient-communication-logs`; `/v2/letter-template`; `/v2/no-show-letter`; `/v2/device`; `/v2/manufacturers`; `/v2/device-types`; `/v2/epic-users`; `/v2/manufacturer-account`; `/v2/hospital`; `/v2/insurances`; `/v2/twilio`; `/v2/in-office`; `/v2/user-activity-log`; `/v2/adt`; `/v2/apiJob`; `/v2/sftp`; `/v2/alert-configurations`; `/v2/referring-providers`; `/v2/report-note-suggestions`; `/v2/service`; `/csp`; `/v2/benchmark-billing`; `/v2/live-call-tasks`; `/cognito`; `/v2/zoom`; `/v2/quick-text-templates`; `/v2/report-notes`; `/v2/alert-protocol`; `/v2/patient-note-deletion-requests`; `/v2/notifications`.

### Unauthenticated, token-less and webhook endpoints (call out)

| Endpoint | Protection actually present | Evidence |
|---|---|---|
| `GET /health-check` | none | `routes/index.js:69` |
| `POST /login` | rate limit (10 failures per 15 min, successes skipped); account lock after 10 bad passwords | `routes/auth.js:11`, `controllers/auth.js:63-69` |
| `GET /oauth/cognito` | none (Cognito code flow) | `routes/auth.js:15` |
| `POST /cognito/verify` | none at route level | `routes/v2/cognito.v2.routes.js:8` |
| `POST /v2/user/forgot-password`, `GET /v2/user/validate-token`, `PUT /v2/user/reset-password` | Joi body validation only (token inside body/link) | `routes/v2/user.v2.routes.js:27-35` |
| `POST /v2/mfa/otp/validate-login`, `PUT /v2/mfa/otp/request` | per-route OTP rate limiters (5 or 10 per 5 min) | `routes/v2/mfa.v2.routes.js:49,55` |
| `POST /bodytrace/bp`, `POST /bodytrace/weight` | none observed (no signature or token); patient found by device IMEI in body | `routes/bodyTrace.js`, `controllers/bodyTrace.js` |
| `POST /v2/twilio/sms-reply`, `/callback`, `/error` | none observed (no `validateRequest` anywhere in tracked code); form-encoded | `routes/v2/twilio.v2.routes.js` |
| `POST /v2/zoom/webhook` | `plainToken` URL-validation handshake, else HMAC-SHA256 over headers `x-zm-signature` + `x-zm-request-timestamp` with `ZOOM_WEBHOOK_SECRET_TOKEN` | `services/v2/zoom.v2.service.js:12-20` |
| `POST /v2/rpm/clinii/webhook-process` | header `code` must equal secret `CLINII_ACCESS_CODE` (mismatch returns 200 with message) | `services/rpm/clinii/clinii.service.js:345-352` |
| `POST /v2/patient/update-document` (PostGrid letter webhook) | body is raw text JWT verified with secret `WEBHOOK_SECRET`; `express.text()` | `routes/v2/patient.v2.routes.js:693`, `controllers/v2/patient.v2.controller.js:1005-1008` |
| `POST /csp/report` | none; `application/csp-report` JSON stored to S3 `csp-violations/` and DB | `routes/v2/csp.v2.routes.js` |
| `POST /v2/service/export-to-ehr`, `POST /v2/patient/no-show-patients/process-connectivity-report` | `validateToken` (`middleware/authorizeService.js`): any JWT signed with `JWT_SECRET`, then acts as the user named by `EVOKE_AUTOMATED_NOTES_USER` (default "EVOKE AUTOMATED NOTES"). Observed defect: missing token calls `next(error)` without returning, so execution continues | `authorizeService.js:6-30` |
| `POST /v2/user/sso/profile` | Cognito M2M: RS256 JWT verified against JWKS of the issuer, `token_use=access`, client in `m2mClients`, scope `users/read` | `middleware/authorizeCognitoClient.js`, `routes/v2/user.v2.routes.js:19` |
| `/v2/patient/automation/*` (3 routes) | no user auth; only `authorizeEnv(["pre","qa"])` (NODE_ENV) | `routes/v2/patient.v2.routes.js:346-358` |

### Auth and user routes

| Method path | Auth | Validator | Handler |
|---|---|---|---|
| POST /login | rate limit | none | `controllers/auth.login` |
| GET /logout | authz() | | `auth.logout` |
| GET /oauth/cognito | none | | `auth.v2.handleCognitoLogin` |
| POST /cognito/verify | none | | `verifyCognitoAuth` |
| GET /cognito/auth-url/:provider | authz(P) | | `generateCognitoAuthUrl` |
| PUT /user/changePassword | authz() | express-validator schema | `controllers/user.changePassword` |
| GET /v2/user/profile | authz() | | `getUserProfile` |
| POST /v2/user/refresh-token | authz() | | `refreshToken` |
| POST /v2/user/sso/profile | Cognito M2M | `ssoProfile` | `getUserProfileForSso` |
| POST /v2/user/forgot-password | none | `forgotPassword` | `sendForgotPasswordLink` |
| GET /v2/user/validate-token | none | | `validateToken` |
| PUT /v2/user/reset-password | none | `resetPassword` | `resetPassword` |
| PUT /v2/user/switch-role/:userId | authz(U,A,AS,C,P,CA,CR,R) | params+body | `switchUserRole` |
| PUT /v2/user/upload-signature/:userId | authz(A) + multer disk `assets/signature` (`logo` field `signature`) | params+body | `uploadSignature` |
| PUT /v2/mfa/update-status | authz(S7+R) | | `updateMFA` |
| POST /v2/mfa/otp/validate-email | authz(S7+R) + limiter | | `validateEmailAddressByOTP` |
| POST /v2/mfa/otp/validate-login | limiter | | `validateLoginByOTP` |
| PUT /v2/mfa/otp/request | limiter | | `requestOTP` |
| GET /v2/mfa/status | authz(S7+R) | | `getUserMFAStatus` |
| POST /admin/user; PUT /admin/user; PUT /admin/user/password; GET /admin/users; PUT /admin/user/activate; PUT /admin/user/deactivate | authz(A,CA,R) | `adminSchema.postUser/putUser/updatePassword` (first three) | `controllers/admin` (`postCreateUser`, `putUpdateUser`, `putUpdatePassword`, `getUsers`, `changeUserStatusToActive`, `changeUserStatusToDeactive`) |
| GET /v2/user-activity-log/top-users-progress-report | authz(A,CA) | | `getTopUserTransmissionReportProgressChart` |
| GET /v2/user-activity-log/user-transmission-progress-analytics | authz(A) | query | `getUserTransmissionProgressAnalytics` |
| GET /v2/user-activity-log/user-transmission-progress-analytics/users | authz(A) | | `getTransmissionProgressAnalyticsUsers` |
| POST /v2/user-activity-log/user-transmission-progress-report | authz(A) | body | `getUserTransmissionProgressReport` (xlsx) |
| GET /v2/user-activity-log/:userId | authz(A,CA) | | `getUserTransmissionReportLogs` (xlsx) |
| GET /v2/user-activity-log/progress-report/:userId | authz(A,CA) | | `getUserTransmissionReportProgressChart` |

### Accounts, hospitals, reference data

| Method path | Auth | Validator | Handler |
|---|---|---|---|
| GET /accounts | authz(S7+R) | | `getAccounts` |
| PUT /accounts/preferences | authz(A,C,CR,U,AS,P) | | `updatePreferences` |
| PUT /accounts/upload-logo/:accountId | authz(A) + multer | params+body | `uploadLogo` |
| GET /v2/hospital | authz(S7+R) | | `fetchAllHospital` |
| GET /v2/manufacturers | authz(A,AS,C,CR,P,U,CA) | | `fetchManufacturers` |
| GET /v2/device-types; GET /v2/device-types/patient-count | authz(S7) ; authz(C,CR,P,CA) | | `fetchDeviceTypes`; `fetchPatientCount` (csv) |
| GET /v2/epic-users | authz(A,AS,C,CR,P,U) | | `fetchAllepicUsers` |
| GET /v2/device; GET /v2/device/alert-list; GET /v2/device/:id; POST /v2/device; PATCH /v2/device/:id; DELETE /v2/device/:id | authz(A,CA) for list, authz(A) others | `createDevice` on POST/PATCH | `fetchAllDevices`, `fetchAlertList`, `fetchDeviceById`, `create`, `update`, `delete` |
| GET /v2/device-groups/selectors | authz(A,U,CA,AS,C,P; key `manual_upload.devices`) | | `getSelectors` |
| GET /v2/device-groups; GET /:id; POST; PUT /:id; DELETE /:id | authz(A,CA) list, A others | `createDeviceGroup` | `getAll`, `getById`, `create`, `update`, `delete` |
| GET /v2/manufacturer-account/active | authz(A,CA,C,P,CR) | | `fetchActiveAccounts` |
| GET /v2/manufacturer-account; GET /:id; POST; PATCH /:id; PATCH /toggle-status/:id; PATCH /change-password/:id; DELETE /:id | authz(A,CA) | create/update/changePassword schemas | `fetchAllManufacturersAccounts`, `fetchManufacturerAccountById`, `saveManufacturerAccount`, `updateManufacturerAccount`, `toggleManufacturerAccountStatus`, `changeManufacturerAccountPassword`, `deleteManufacturerAccount` |
| GET /v2/insurances; GET /benchmark (calls Benchmark API) | authz(A,CA,C,CR,U,AS,P) | | `fetchInsurances`, `fetchInsurancesFromBenchmark` |
| POST /v2/insurances; PATCH /:id; DELETE /:id | authz(A) | insurance schemas | `createInsurance`, `updateInsurance`, `deleteInsurance` |
| GET /v2/referring-providers | authz(A,C,CR,P,CA,U,AS) | | `getReferringProviders` |
| POST /v2/referring-providers; PATCH /:id; DELETE /:id | authz(A) | schemas | `createReferringProvider`, `updateReferringProvider`, `deleteReferringProvider` |
| GET /v2/alert-configurations/:account; PUT /v2/alert-configurations | authz(A,U) ; authz(A) | `upsertAlertConfiguration` (PUT) | `getByAccount`, `upsert` |
| GET/POST /v2/alert-protocol, PUT/DELETE /v2/alert-protocol/:protocolId | authz(A) | query/body/params | `getAlertProtocols`, `createAlertProtocol`, `updateAlertProtocol`, `deleteAlertProtocol` |
| POST/GET /v2/billing-amount, GET/PUT/DELETE /:id | authz(A,CA) | none | `create`, `getAll`, `getById`, `update`, `delete` |
| GET /v2/benchmark-billing/search | authz(A) | query | `searchBenchmarkBillingByDate` |
| GET /v2/adt/download/:filename | authz(A,CA) | params | `downloadAdt` (streams S3 `adts/<file>`) |
| GET /adt/get/:mrn | authz(A,CA) | express-validator | `controllers/adt.getAllByMrn` |
| GET /v2/notifications; PATCH /:notificationId/read; PATCH /mark-all-read | authz(A,AS,U,CA,C,CR,P) | | `getUserNotifications`, `markNotificationRead`, `markAllNotificationsRead` |

### Patients

`routes/patient.js` (legacy, mount `/patient`): PUT `/updateschedule` (A,C,CR,U,AS), PUT `/information`, PUT `/device-information` (A,C,CR,U,AS,CA,P), GET `/physicians`, PUT `/mrn` (A,C,CR,P,U,AS), PUT `/information/physicians`, PUT `/activate`, PUT `/deactivate`, PUT `/centra-heart-failure/:id` (A,CA); all via `controllers/patient`; Joi or schemaValidator on bodies. `routes/rpm.js`: GET `/patient/rpm/btbp/:patient_id` (A,U,C,CR,P,CA) `getRpmBtBpData`.

`routes/v2/patient.v2.routes.js` (mount `/v2/patient`), controller `patient.v2.controller` unless noted; S7 unless noted; validators in `validators/v2/patientValidator`:

| Method path | Auth | Handler |
|---|---|---|
| GET /list; GET /download-list (xlsx); POST /disconnected-monitors (xlsx, calls bot Lambda); POST /no-show-master-list (xlsx) | S7 | `getPatientList` (envelope with `meta`), `downloadPatientList`, `downloadDisconnectedMonitors`, `downloadNoShowMasterList` |
| PATCH /update-advisory; GET /non-compliant-list; GET /patients-by-evoke-id; POST /merge-patients | A | `updatePatientAdvisory`, `getNonCompliantPatientList`, `findPatientsByEvokeId`, `mergePatientsByEvokeId` |
| GET /non-compliant-patient/reminders; GET /no-show-patients/download/overdue (xlsx); GET /non-enrolled-patients; POST /non-enrolled-patients/enroll; GET /search-patient; POST,PUT /:patientId/live-call; PUT /update-benchmark-id/:patientId | A,U | `getNonCompliantPatientWithRemindersList`, `downloadOverduePatients`, `getNonEnrolledPatientList`, `enrollNonEnrolledPatient`, `searchPatient`, `addLiveCall`, `updateLiveCall`, `updateBenchmarkId` |
| GET /non-compliant-patient/:patient_id/reminder-history | A,U,CA,C,P | `getNonCompliantPatientWithReminderHistory` |
| POST /no-show-patients/process-connectivity-report | service JWT | `processConnectivityReport` (body `{patientEvokeIds:[...]}`) |
| GET /form-settings | S7 | `patientDataPointController.getPatientFormSettings` |
| PUT /update-active/:patientId; PUT /next-send/:_id/:date; PUT /next-send/update | S7 / A,C,CR,U,AS,CA | `updatePatientById`, `updateNextSend`, `updateNextSendAndNextBillingDate` (triggers bot SQS) |
| GET /recordsByName; GET /recordsByNameOrDobOrEvokeId | S7 | `findPatientRecordsByName`, `findPatientRecordsByNameOrDobOrEvokeId` |
| GET /:patientId; GET /:serialNumber (unreachable: identical pattern declared after `/:patientId`, observed) | S7 | `getPatientById`; `getPatientBySerialNumber` |
| GET /profile/:patientId; GET /:serialNumber/reports; GET /:patientId/tasks; GET /device-alert/list; GET /notes/:patientId; GET /fetch/document/:serialNumber; GET /fetch/document-signed-url; GET /medication/:patientId; GET /analytics/:patientId; GET /lead-information/:patientId; GET /reminder-logs/:patientId; GET /billing-history/:reportId | S7 (some A,C,CR,U,AS,CA) | `getPatientNextSendAndBillingSchedule`, `getPatientReports`, `getPatientTasks`, `getDeviceAlertList`, `getPatientNote`, `getPatientDocuments`, `getPatientDocumentsByFilePath`, `patientMedicationController.fetchByPatientId`, `patientAnalyticController.getPatientAnalytics`, `getLeadInformation`, `getReminderLogs`, `getPatientBillingHistory` |
| POST /export/late (xlsx) | A,U,AS,CA | `exportLatePatients` |
| POST /enroll; POST /create/:serialNumber; POST /new-device/:patientId | S7 / A,U,CA,C | `enrollPatient` (can emit Benchmark and CardioOne events), `createPatient`, `addNewDevice` |
| PUT /updateBillingSchedule | A,C,CR,U,AS,CA | `controllers/patient.updateBillingSchedule` |
| POST /notes | S7 | `addPatientNote` |
| PUT /anticoag-status/:id (key `transmission_report.anticoag_status`); PUT /laao-device/:patientId; PATCH /idtf/:patientId (A,U,AS; may publish Benchmark event); PUT /insurance; PUT /information/:patientId; PUT /profile/:serialNumber; PATCH /patient-information/:serialNumber; PUT /transmission/:serialNumber; PATCH /:patientId/self-pay; PATCH /:patientId/pre-auth; PUT /subscribe-setting/:patientId | S7 | `updateAnticoagStatus`, `updateLaaoDevice`, `updateIDTF`, `updateInsurance`, `updatePatientInformationById`, `updateBasicInformation` (x2), `updatePatientTransmission`, `updateSelfPayStatus`, `updatePreAuthStatus`, `updateSubscribeSettings` |
| POST /document-upload (multer-s3 `Documents/`, types jif,gif,pdf,jpg,png,bmp,svg) | A,AS,U,CA | `uploadDocument` |
| POST/PUT/DELETE medication: POST /medication; PUT /medication; DELETE /medication/:patientId/:medicationId | S7 / A,U,CA | `patientMedicationController.create/updateMedicationByPatientId/deleteMedicationByPatientId` |
| GET /battery-information/:patientId | A,U,CA | `getBatteryInformation` |
| POST,GET,PUT /:patientId/datapoint | A,U,CA (GET S7) | `patientDataPointController.create/get/updatePatientDataPoint` |
| POST /send-letter/:serialNumber | A,U,AS,CA | `sendLetterToPatient` (PostGrid) |
| POST /update-document | none (PostGrid JWT) | `updatePatientDocumentStatus` |
| PUT /lead-information/:patientId | S7 | `updateLeadInformation` |
| POST /billing-history (xlsx); POST /download-reminder-patients (xlsx) | S7 / A,AS,C,CA,P,CR | `exportBillingHistory`, `downloadReminderPatients` |
| GET /automation/:serialNumber; POST /automation/enroll; DELETE /automation/:serialNumber | NODE_ENV pre or qa only | `getPatientBySerialNumberWithReports`, `enrollNewPatientWithReports`, `deletePatient` |

Other patient-adjacent: `/v2/patient-communication-logs` GET `/` `/:id` `/patient/:patientId` (A,AS,U), POST `/`, PUT/DELETE `/:id` (A,U) `getAll/getById/getByPatientId/create/update/delete`; `/v2/report-banners` GET/PUT `/:patient_serial_number` (S7) `getByPatientSerialNumber`, `upsert`; `/v2/patient-note-deletion-requests` GET `/pending-approvals`, GET `/pending-approvals/:requestId`, PATCH `/pending-approvals/:requestId/:status` (A,AS,U,CA), PUT `/notes/:patientId/:noteId` (S7); `/v2/live-call-tasks` GET `/` (A,U,AS), PUT `/:taskId/mark-complete` (A,U); legacy root `routes/tasks.js`: POST `/task`, PUT `/task/:taskId`, GET `/tasks`, `/tasks/automated/scheduling`, `/tasks/archived`, `/tasks/audited`, `/tasks/audited/archived`, PUT `/tasks/archive`, GET `/tasks/report/:reportId` (A,AS,U,CA; keyed `transmission_report.tasks` on three); legacy `routes/scheduling.js`: POST `/scheduling`, POST `/scheduling/all`, DELETE `/scheduling` (U,A,C,P,CA) `controllers/scheduling`.

### Transmissions and reports

`routes/v2/transmission.v2.routes.js` (mount `/v2/transmission`), `transmissionController`:

| Method path | Auth | Notes |
|---|---|---|
| GET /; GET /count | A,U,AS | `transmissionReports`, `reportsCount` |
| GET /clinic; GET /clinic/count | C,CR,P,CA | `clinicReports`, `clinicReportsCount` |
| GET /:id | S7 | `getReportDetail` |
| POST /user-report | A,U,CA,C,P (key `manual_upload.report_upload`) | multer-s3 `ManualUploads/<manufacturerFolder>/<accountFolder>/<date>/`; `uploadUserReport`; Joi body |
| PUT /report-notes | A,U,C,P,CA | `updateReportNotes` (can enqueue alert notifications, see outbound) |
| GET /previous-reports/:reportId; GET /previous-alerts/:reportId | S7 | `getPreviousReports`, `getPreviousAlerts` |
| PUT /nurse-flagging/:reportId/:status | C,CA (key `transmission_report.nurse_flag`) | `updateNurseFlag` |
| PUT /diagnosis-codes | A,U,C,P,CA | `updateDiagnosisCodes` |
| PUT /update-transmission-report/:reportId | A,U,CA, multer-s3 | `updateTransmissionReport` |
| PUT /archive-reports; PUT /unsign-reports; PUT /ehr-notes/:reportId | A,U,C,CR,P,CA | `archiveReports`, `unsignReports`, `upsertEHRNotes` |
| GET /activity-logs/:reportId | A | `getTransmissionActivityLogs` |
| PATCH /audit-status/:reportId | A | handler order is controller then Joi validator (validation runs after the controller, observed at `transmission.v2.routes.js:213-217`) |
| PUT /:reportId/clinic-note; PUT /:reportId/provider-note; PUT /:reportId/assign-physician | A,C,CR,P,CA / C,CA,CR,P / A,U,C,AS,CA,CR | `notesController.addClinicNoteWithQuickText`, `addProviderNote`, `transmissionController.assignPhysicianToReport` |

`routes/v2/transmissions.js` (mount `/v2/transmissions`): GET `/report/:id` (S7), PUT `/process-reports`, `/unprocess-reports`, `/clinic/sign-reports`, `/clinic/bill-reports` (A,U,C,CR,P,CA variants), PUT `/clinic-notes`, `/rn-chf-screening-notes` (C,CA), `/clinician-notes` (S7), PUT `/report/alert/:_id/:status`, `/report/alert-status/:reportId/:status`, GET `/physicians`, POST `/bulk-download` (authz(); returns zip). Controllers: `controllers/transmissions` (v1) and `notes`/`notes.v2`.
Others: `/v2/archived-report` GET `/list` (json), `/download-list` (xlsx), `/download-reports` (zip) (S7 minus none; query-validated); `/v2/report-notes` POST `/:reportId/contents/:contentId/comments`, PUT `.../comments/:commentId` (C,P,CA); `/v2/report-note-suggestions` GET `/:reportId` (S7); `/v2/report-note-sections` GET `/`, GET `/:id`, POST, PUT/DELETE `/:id` (A,AS,U,CA); `/v2/report-templates` GET `/selectors`, `/`, `/:id`, POST `/report-information`, POST `/`, PUT/DELETE `/:id` (A,AS,U,CA; report-information S7); `/v2/quick-text-templates` GET `/`, POST `/add`, PUT/DELETE `/:id` (C,CA,P,CR); `/v2/manual-upload` POST `/extract-report-data` (A,U,CA,C,P; key `manual_upload.report_upload`; multer memory, up to 10 files `reports`); `/v2/in-office` POST `/upload` (A,U,CA; key `manual_upload.inoffice_note_upload`; multer memory, `file`), POST `/similar-patients` (A,U,CA); `/v2/dashboard` GET `/transmissions`, `/billable-intervals`, `/manufacturer-list`, `/patients`, `/doctors`, `/doctors/download-report` (csv), `/accounts`, `/electronic-device`, `/surgery-types` (xlsx when a valid procedure id is given) (S7), `/revenue` (A,P,CA), `/account-analytics` (A,CA), `/patient-compliance-analytics` (A).

### HL7 jobs, API jobs, SFTP, RPM, letters, misc

| Method path | Auth | Handler |
|---|---|---|
| GET /hl7job/v2; GET /v2/hl7job | A,CA | `controllers/hl7-job.hl7JobGetAllV2` |
| PUT /hl7job/v2/update/:id; /retry; /markComplete; DELETE /hl7job/v2/deleteJobs | A,CA | `hl7JobUpdateV2`, `hl7JobRetryV2`, `hl7JobMarkCompleteV2`, `hl7JobDeleteV2` |
| PUT /hl7job/v2/retry/:id | A,C,CR,P,CA | `hl7JobRetryFromTransmissionV2` |
| PUT /hl7job/v2/processBulkHl7Jobs | A,C,CR,P,CA | `processBulkHl7Jobs` (emits `bulkHL7`) |
| POST /v2/service/export-to-ehr | service JWT | `bulkAsyncExportToEhr` (body = array of report ids, passed to `bulkHL7` emitter; reply `{type:"Success",message:"Reports queued for processing.",data:null}`) |
| PUT /v2/apiJob/retry/:reportId; GET /v2/apiJob; PATCH /markComplete; DELETE /delete; PUT /retry | C,P,... / A,CA | `createJobForIntergy`, `fetchApiJobs`, `markApiJobsComplete`, `deleteApiJobs`, `bulkRetryApiJobs` |
| PUT /v2/sftp/:reportId | A,U,C,P,CA | `exportReportToSFTPInterface` |
| GET /v2/rpm; POST /download-late-rpm/:account (csv); POST /download-report/:patientId (pdf); POST /rpm-patient-billing/:patientId; POST /download-rpm-billing (xlsx); GET /bp-reading/:patientId; PUT /bp-reading-history/:patientId; GET /:patientId/scale-reading | A,U,C,CR,P,CA (some AS) | `rpmController.*` |
| GET /v2/rpm/clinii/signin-portal | A,U,C,CR,P,CA,R | `getSignInPortalLink` |
| POST /v2/rpm/clinii/webhook-process | header `code` | `processCliniiWebHookMessage` |
| /v2/letter-template: GET `` , DELETE `/:id`, PATCH `/update-status`, POST `/upload` (multer-s3 html, fields primaryTemplate and translatedTemplates), POST `/create`, PATCH `/update/:templateId`, POST `/generate`, POST `/save`, GET `/letter-next-send`, GET `/:patientId` | A,CA (generate/save/next-send/by-patient also AS,U) | `fetchLetterTemplates`... |
| /v2/no-show-letter: POST `/upload`, POST `/generate`, POST `/send` (SES email), GET `/:patient_id` | A,CA / A,AS,U | `uploadNoShowLetterTemplate`, `generateNoShowLetter`, `sendNoShowTemplateEmail`, `fetchNoShowTemplatesByPatientId` |
| /v2/twilio: POST `/sms-reply`, `/callback`, `/error` | none | `receiveMessage`, `updateSmsOrVoiceLog`, `createOrUpdateError` |
| POST /v2/zoom/webhook; POST /csp/report | signature / none | `handleWebhook`, `reportViolation` |

## Envelopes (observed)

- Success (most v2): `{type:"Success", message, data}`, lists add `meta:{page,pageSize,total,alertCount,connectivityStatusCount}` (`util/v2/pagination.v2.util.js`). Some handlers return `{error:false,message}` (BodyTrace, logout) or bare `{message}` (webhooks).
- Error: `{type:"Error", data, error:true, message}` with HTTP status from `ErrorResponse` (default 500); Joi, Mongo duplicate/cast and JWT errors are mapped to 400/401 (`middleware/errorHandler.js`, `util/v2/error.js`). Some controllers return HTTP 200 with `{type:"Error"}` (dashboard procedure) or `{type:"error"}` with 400 (`processConnectivityReport`).
- Validation is Joi `abortEarly:false` and does not replace `req.body` with the coerced value (`validate.v2.util.js:4-9`), so controllers see unconverted input (observed).
- Login returns token in the JSON (`data.token`) and in cookie `token`; MFA branch returns `{type,message}` and requires OTP routes.

## Outbound message contracts (names of env vars only)

| Channel | Producer | Payload | Evidence |
|---|---|---|---|
| SQS `AWS_BENCHMARK_QUEUE_URL` | patient, billing, transmission services | `{eventType:"INSERT_PATIENT"\|"UPDATE_PATIENT", payload:{patientId}}`; `{eventType:"CHARGE_EXPORT", payload:{reportId}}`; sent only when account `settings.export_for_billing` (and patient `information.idtf` for insert/charge); failures only logged | `services/v2/benchmark.v2.service.js`, `services/transmissions.js:158-165` |
| SQS `AWS_CARDIO_ONE_QUEUE_URL` | `cardioOneEventEmitter` on enroll/patient update | `{eventType:"FETCH_RHYTHM_ID", payload:{jobId:<cardio_one_api_logs _id>}}`; only if account has `medical_center_id` and no initiated/completed log exists | `events/cardioOneEventEmitter.js` |
| SQS `AWS_INTERGY_QUEUE_URL` | apiJob service | `{event_type:"JOB_PROCESSING", event_payload:{job_id}}` | `services/v2/apiJob.v2.service.js:22` |
| SQS `AWS_SFTP_QUEUE_URL` | `sftpEventEmitter` (`sftpExportEvent`) | `{payload:{jobId}}`; job in `sftp_jobs` (status initiated/completed/failed, strategy "SFTP Client", event type `REPORT_EXPORT`) | `events/SFTPEventEmitter.js` |
| SQS `AWS_ALERT_NOTIFICATION_QUEUE_URL` | `updateReportNotes` | `{env, alert_type, recipients, message_content, notification_method (email\|slack\|...), report_id, account, alert_sender, client_url, [s3_bucket, has_attachment, report_file_path, report_cover_page_path], [slack_channels]}` | `services/v2/transmission.v2.service.js:610-660` |
| SQS `AWS_BOT_QUEUE_URL` | `updateNextSendInManufacturer` | `{eventType:"BOT_EVENT_TRIGGER", value:"<patientId>"}`, retried up to 3 times | `services/updateNextSendInManufacturer.js:247-251` |
| SNS `AWS_SNS_HL7JOB_TOPIC_ARN` | `hl7job.service` | `{hl7JobId}` with MessageAttribute `account` (String) | `services/v2/hl7job.service.js:164` |
| Lambda `AWS_LAMBDA_FUNCTION_NAME_TWILIO` | twilio service | `{TYPE:"retry_by_next_contact_number", retryPatients:[{patientId, existingLogId}]}` | `services/v2/twilio.v2.service.js:187` |
| Lambda `AWS_LAMBDA_FUNCTION_NAME_BOT` | patient service | `{eventType:"GET_DISCONNECTED_MONITORS", manufacturer, account}`; sync response `Payload` parsed as JSON | `services/v2/patient.v2.service.js:1204-1212` |
| Slack webhooks, PostGrid, Clinii, Benchmark, CardioOne, Twilio, SES | see `dependencies.md` | | |

All SQS sends use `DelaySeconds` 10 and a JSON string body.

## HL7 export (job documents, strategies)

This service does not render HL7 text. It builds job documents in `hl7jobs` and publishes the id to SNS; the HL7 builder/sender is an external consumer (`unknown`). Job types (`common/constant.js:442`): `ORU_R01` (PDF result, status key `oru_status`), `DFT_P03` (billing charge, `dft_status`), `IDCO_ORU_R01` (discrete device data, `idco_status`). Eligibility per type (`services/v2/hl7job.service.js`): ORU when alert, billable or explicitly non-billable; DFT when billable, not preliminary, not a restricted resend; IDCO for HL7 transmissions with alert/billable/non-billable and not preliminary. Per-account job builders (maps `oruJobMap`, `dftJobMap`, `idcoJobMap`): Centra (also Centra Heart Failure), Campbell County Health Cardiology (CCH), Aspen Valley, Bond Clinic, UCHealth North/Metro/South and Pueblo (UCH: ORU, DFT, IDCO), Denver Health (ORU, DFT), TJ Samson, University of Toledo (ORU, DFT), Grand Heart (ORU, DFT), Covenant group (Parkway, Knoxville Heart Group, CAET), Tenet group (New Braunfels, Heart Clinic of San Antonio, Baptist Heart & Vascular, HAVIT doctors, West Kentucky Heart and Lung, Have a Heart Clinic); other accounts use `services/hl7/default.js`. Base job fields (`base_hl7job.js` `buildJobResponse`): `report_id, patient_serial_num, status (pending|error), failed_reason[], csn, epicID, epicFirstName, epicLastName, report_date, dob, alert_flag, warning_flag, firstName, lastName, gender, middleInitial, mrn, account, type, visit_location, result_status ("P" preliminary / "F" final), adt_file, adt_id, transcriptionist, transmission_type, pre_id`; DFT adds `billing_code, billing_amount, report_billing_date, control_id, insurance_plan, patient_class, location, transaction_type, admission_type`. Inputs resolved from `adts` (inbound ADT data, populated outside this repo: writer `unknown`), `epic_users` and `billing_amounts`. Failures set status `error` and post to Slack (`EHR_SLACK_WEBHOOK_URL`). Strategies: `provider_strategy.js` (preliminary/final provider resolution), `adt_strategy.js` (default and per-facility ADT lookup), `denver_health_hl7job_strategy.js`.

## File exports and generated files

- xlsx (exceljs, streamed in the response): patient list, overdue patients, late-patient export, disconnected monitors, no-show master list, billing history, reminder patients (twilio), archived report list, RPM billing invoice, user activity and transmission progress reports, dashboard procedures. csv: dashboard doctors report, late RPM list, device-type patient count. zip (archiver): `POST /v2/transmissions/bulk-download`, `GET /v2/archived-report/download-reports`. PDF: report with cover page (Puppeteer + pdf-lib, `coverpages/` in S3), RPM report, patient letters, connectivity report (`connectivityReport/<date>/`), RPM invoice xlsx uploaded to `invoices/<account>/`.
- SFTP: no direct SFTP transfer in this repo (see `dependencies.md`).

## What other systems rely on

- Front end (not registered): all `/v2` routes, the cookie/bearer token, header `Account`, role-keyed feature preferences, `Content-Disposition` exposure, the envelopes above.
- Parser (registered): `reports`, `patients`, `report_notes`, `tasks`, `cardio_one_api_logs` collections and `reports.file_path|hf_file_path|hl7_file_path` shapes written by it and consumed here.
- Webhook callers rely on route paths `/bodytrace/*`, `/v2/twilio/*`, `/v2/zoom/webhook`, `/v2/rpm/clinii/webhook-process`, `/v2/patient/update-document`, `/v2/service/export-to-ehr`, `/v2/patient/no-show-patients/process-connectivity-report`, `/v2/user/sso/profile`.
- Queue consumers rely on the payload shapes and spellings above (`eventType` vs `event_type`, `jobId` vs `job_id` differ across queues; the parser uses different spellings for Benchmark and CardioOne).

## Unknowns

Callers of the service-token endpoints; whether Twilio/BodyTrace requests are restricted at the network layer; exact Joi field shapes per route (not transcribed; see `validators/v2/`); full request/response bodies of each controller; consumer implementations.
