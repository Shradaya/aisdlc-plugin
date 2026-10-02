---
repository: evoke-portal-front-end
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_branch: main
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/static/endpoints.js, src/app/services/**, src/services/**, src/actions/**, src/app/lib/api.js, src/app/lib/cacheApi.js, src/hooks/useSocket.js, src/containers/AppPage/index.js, src/components/AppRoutes/index.js]
---

# evoke-portal-front-end: Interfaces (Phase E)

Response schemas belong to `rest-api-evoke`; this repository has no types or OpenAPI. Paths are relative to `REACT_APP_BASE_URL`. Server-side authorization is `unknown`.

## Shared REST conventions (observed)

- Clients: `src/app/lib/api.js` (axios, `baseURL`, `withCredentials`), `cacheApi.js` (axios plus cache interceptor), `src/utils/http.js` (only dead code), and raw `fetch` in `src/actions/*` and a few components.
- Auth: `Authorization: Bearer <localStorage.authToken>`; cookies are also sent; no CSRF header found. Custom header `account: <clinic name>` on several report, upload, device-group and task calls.
- Response: the interceptor returns `response.data` (server envelope `{data, meta, message}`); blob responses return the full axios response (filename from `Content-Disposition`). Errors reject with the server body (`{message, error?, data:{code}}`); OTP codes `OTP_REQUEST_LIMIT_EXCEEDED` and `OTP_VALIDATION_ATTEMPT_LIMIT_EXCEEDED` are read from `error.data.code`. Raw-`fetch` callers expect `{error, message}` and string-compare messages.
- 401 (except `/login`, `/logout`): session-expired toast, cross-tab broadcast, local logout after 2 s; the request promise never resolves.
- Token refresh: warning 5 minutes before expiry, `POST /v2/user/refresh-token` expecting `data.token`.
- Lists use `page`/`pageSize` (or `limit`/`page`), `sort=<col>&order=asc|desc`, column filters as `<columnId>=<value>`.

## Backend endpoints by domain (observed; evidence in `src/app/services/<domain>` and `src/static/endpoints.js`)

**Auth, MFA, Cognito, session:** POST `/login`; POST `/v2/mfa/otp/validate-login`; PUT `/v2/mfa/otp/request`; POST `/v2/mfa/otp/validate-email`; PUT `/v2/mfa/update-status`; GET `/v2/mfa/status`; GET `/oauth/cognito`; POST `/cognito/verify`; GET `/cognito/auth-url/{provider}` (screen passes "Rhythm"); GET `/logout`; POST `/v2/user/refresh-token`; GET `/v2/user/validate-token?token=`; PUT `/v2/user/reset-password`; POST `/v2/user/forgot-password`; POST `/user/resetPassword` (legacy); PUT `/user/changePassword`; GET `/v2/user/profile`; PUT `/v2/user/switch-role/{userId}`. Login response data read: `token, passwordExpired, name, role, userId, user_prefs, clinicName, hasRPMDevices, followingPhysicians, isFollowingPhysician, followingHospitals, isFollowingHospital, clinii_user_id, primary_role` (empty data means MFA OTP pending).

**User administration:** GET `/admin/users`; POST/PUT `/admin/user`; PUT `/admin/user/password`; PUT `/admin/user/deactivate`, `/admin/user/activate`.

**Transmissions worklist and report workflow:** GET `/v2/transmission` (Evoke roles) or `/v2/transmission/clinic` (clinic roles) with `view` (`active|processed|clinic-review|clinic-processed`), paging, `search`, filters, `sort`/`order`; GET `.../count`; GET `/v2/transmission/{reportId}`; GET `/v2/transmissions/report/{reportId}` (PDF blob, `coverPage`, `isHF`, `view`; cached via `cacheApi`); POST `/v2/transmissions/bulk-download`; PUT `/v2/transmissions/process-reports`, `unprocess-reports`; PUT `/v2/transmissions/clinic/sign-reports`, `clinic/bill-reports`, `/v2/transmission/unsign-reports`; PUT `/v2/transmission/archive-reports`, `unarchive-reports`; PUT `/v2/transmissions/clinic-notes`, `/v2/transmissions/clinician-notes`, `/v2/transmission/report-notes`, `/v2/transmission/diagnosis-codes`, `/v2/transmissions/rn-chf-screening-notes`, `/v2/transmission/{reportId}/clinic-note` and `/provider-note`, `/v2/transmission/update-transmission-report/{reportId}`, `/v2/transmission/ehr-notes/{reportId}`; report-note comments `/v2/report-notes/{reportId}/contents/{contentId}/comments`; PATCH `/v2/transmission/audit-status/{reportId}`; PUT `/v2/transmission/{reportId}/assign-physician`; PUT nurse-flagging and alert-status routes; PUT `/hl7job/v2/retry/{reportId}`, `/v2/apiJob/retry/{reportId}`, `/v2/sftp/{reportId}`; GET previous-reports, previous-alerts, report-note-suggestions, billing-history, report banners; tasks per report; GET `/v2/hl7job`, PUT `/hl7job/v2/processBulkHl7Jobs`, `/hl7job/v2/retry`, `/hl7job/v2/update/{jobId}`; ADT `/v2/adt/download/{filename}`, `/adt/get/{query}`. Row keys the table reads include `account, active, assignedPhysician, billable, date, device, device_alert, dob, eSig, evoke_id, hospital, lastBillDate, manufacturer, mrn, name, nextSend, oru, patientAlert, physicians, reportNotes, returned, signedAt, signedBy`.

**Patients:** `/v2/patient/list`, `download-list`, `disconnected-monitors`, `no-show-master-list`, `billing-history`, `enroll`, `create/{serial}`, `new-device/{id}`, `update-active/{id}`, `{id}` and `profile/{id}` (GET/PUT), `patient-information`, `information`, `device-information`, `transmission/{serial}`, `updateBillingSchedule`, `next-send/*`, `insurance`, `analytics/{id}`, `battery-information/{id}`, `{serial}/reports`, `{id}/tasks`, document fetch/upload/signed-url, medication CRUD, lead-information, `send-letter/{serial}`, `reminder-logs/{id}`, `subscribe-setting/{id}`, notes and note deletion, search endpoints (`recordsByName`, `recordsByNameOrDobOrEvokeId`, `search-patient`, `patients-by-evoke-id`), `form-settings`, datapoints, `merge-patients`, `update-advisory`, `update-benchmark-id`, `self-pay`, `pre-auth`, `anticoag-status`, `laao-device`, `idtf`; legacy unversioned `/patient/*` family also used; `/v2/hospital`; `/accounts`; `/v2/dashboard/accounts`; GET `/v2/insurances/benchmark`.

**No-show patients and live calls:** `/v2/patient/non-compliant-patient/reminders` and `/{id}/reminder-history`; `/v2/patient/non-enrolled-patients` (+ `/enroll`); POST/PUT `/v2/patient/{id}/live-call`; GET `/v2/patient/no-show-patients/download/overdue`; GET `/v2/live-call-tasks`; PUT `/v2/live-call-tasks/{id}/mark-complete` (`{reason, completionDate}`).

**Tasks and approvals:** GET `/tasks`, `/tasks/archived`, `/tasks/automated/scheduling`, `/tasks/audited`, `/tasks/audited/archived`, `/v2/patient-note-deletion-requests/pending-approvals`; POST `/task/`, PUT `/task/{id}`, PUT `/tasks/archive`, DELETE `/task`; PATCH `/v2/patient-note-deletion-requests/pending-approvals/{id}/{status}`.

**RPM and communication logs:** GET `/v2/rpm/clinii/signin-portal` (URL for the iframe); GET `/v2/rpm`; `/patient/rpm/btbp/{id}`; `/v2/rpm/{id}/scale-reading`; `/v2/rpm/bp-reading*`; downloads `/v2/rpm/download-*`; `/v2/patient-communication-logs[...]`; POST `/v2/patient/export/late`.

**Letters:** `/v2/letter-template[...]` (GET/POST/PATCH/DELETE, generate, save, update-status, letter-next-send), `/v2/no-show-letter[...]`.

**Reference data and configuration:** `/v2/report-templates[...]`, `/v2/report-note-sections[...]`, `/v2/device-groups[...]`, `/v2/device[...]`, `/v2/device-types[...]`, `/v2/insurances[...]`, `/v2/referring-providers[...]`, `/v2/billing-amount[...]`, `/v2/manufacturers`, `/v2/manufacturer-account[...]`, PUT `/accounts/preferences`, `/v2/alert-configurations[...]`, `/v2/alert-protocol[...]`, `/v2/quick-text-templates[...]`.

**Notifications:** GET `/v2/notifications`; PATCH `/v2/notifications/mark-all-read`, `/{id}/read`.

**Dashboard analytics:** GET `/v2/dashboard/{patients,transmissions,billable-intervals,manufacturer-list,electronic-device,revenue,account-analytics,patient-compliance-analytics,doctors,doctors/download-report,surgery-types}`.

**User activity log:** `/v2/user-activity-log/{userId}`, `progress-report/{userId}`, `top-users-progress-report`, `user-transmission-progress-analytics`, `user-transmission-progress-report`.

**Archived, manual and in-office upload, billing exports, API jobs:** `/v2/archived-report/{list,download-list,download-reports}`; POST `/v2/transmission/user-report` (multipart, header `account`); POST `/v2/in-office/upload`, `/v2/in-office/similar-patients`; POST `/v2/manual-upload/extract-report-data`; GET `/v2/benchmark-billing/search`; `/v2/apiJob[...]`.

Dead endpoint keys: `endpoints.reportTemplates.getByReportId` and `endpoints.letter_templates.archiveLetterTemplate` are not defined (callers unused). `pdfReport` can build a URL with two `?` markers.

## Socket.io (observed)

One ref-counted connection per namespace and user with `auth: {token}`; URL `${REACT_APP_SOCKET_SERVER_URL}/<namespace>`; enabled only when `REACT_APP_ENV` is `prod` or `pre`; every namespace uses server event `socket:ready`.

| Namespace | Emits | Listens |
|---|---|---|
| `reportPresence` | `report:join`, `report:heartbeat` (15 s), `report:leave`, `dashboard:reports:subscribe`, `dashboard:reports:unsubscribe` | `report:presence:detail`, `dashboard:reports:presence` |
| `notifications` | `notification:new {userIds[]}` | `notification:updated` (triggers refetch of `GET /v2/notifications`) |
| `transcribe` | `transcribe:start {sampleRateHertz:16000, languageCode:"en-US", mediaEncoding:"pcm"}`, `transcribe:audio`, `transcribe:stop` | `transcribe:started`, `transcribe:ready`, `transcribe:transcript`, `transcribe:error` |

## Cache layer, files, storage (observed)

`cacheApi` is used only for the report PDF blob GET, `GET /cognito/auth-url/{provider}`, `POST /cognito/verify` and `POST /v2/report-templates/report-information`; TTL `unknown`. Downloads (blob): report PDFs, bulk reports, patient lists, billing, RPM, doctors csv, user-activity, archived reports xlsx and zip. Uploads (multipart): patient document, manual report, in-office, extract-report-data. Client-side PDF merge/split with pdf-lib. localStorage keys and `BroadcastChannel("redux_sync")` are listed in `data-model.md`.

## What this repository exposes

Browser routes (full table in `architecture.md`): public `/login` (`?wearables=true` shows the Cognito button, `?error=`), `/reset-password?token=`, `/reset/:authToken`, `/auth/cognito` (reads `code`, `id_token`, `error`); protected deep links `/patient/:patientId` and `/patient/report/:reportId` (opened in new tabs); `/tasks/*` reads `?document_id=` to highlight a row. nginx serves static files on port 8080 with an SPA fallback; no health endpoint and no API. `postMessage`: receives only from `https://applications.zoom.us` (`zp-init`, `zp-ready`, `zp-call-ringing-event`, `zp-call-log-completed-event`) and sends `zp-make-call` with origin checks. `frame-ancestors 'self'` forbids embedding by other sites.

## Unknowns

Backend URL per environment, response schemas, cookie names, per-endpoint authorization, socket server owner, Cognito domain and client, Clinii host, cache TTL.
