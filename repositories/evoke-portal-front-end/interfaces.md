---
repository: evoke-portal-front-end
analyzed_commit: 35b36e323291354f6cb8fe43162c8f0dec9a1478
analyzed_branch: main
analyzed_at: 2026-10-15T08:45:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/static/endpoints.js, src/app/services/**, src/services/**, src/actions/**, src/app/lib/api.js, src/app/lib/cacheApi.js, src/hooks/useSocket.js, src/containers/AppPage/index.js, src/components/AppRoutes/index.js, src/app/services/accountDocument/accountDocument.js, src/static/account_document.js, src/utils/auth.js, src/utils/http.js, src/containers/AppPage/Header/OTPModal/index.js, src/app/services/task/taskService.js, src/app/services/transmission/patient.js, src/app/services/patient/patient.js, src/app/services/notification/notificationService.js, src/app/services/notificationPreference/notificationPreference.js, src/components/pages/transmissions/modal/detail/notes/report_notes/modals/alert_notification/useAlertNotification.js]
---

# evoke-portal-front-end: Interfaces (Phase E)

Response schemas belong to `rest-api-evoke`; this repository has no types or OpenAPI. Paths are relative to `REACT_APP_BASE_URL`. Server-side authorization is `unknown`.

## Shared REST conventions (observed)

- Clients: `src/app/lib/api.js` (axios, `baseURL`, `withCredentials`), `cacheApi.js` (axios plus cache interceptor), `src/utils/http.js` (axios instance with the same 401 handler; callers not re-verified, previously recorded as unused), and raw `fetch` in `src/actions/*` and a few components.
- Auth: `Authorization: Bearer <localStorage.authToken>`; cookies are also sent; no CSRF header found. Custom header `account: <clinic name>` on several report, upload, device-group and task calls.
- Response: the interceptor returns `response.data` (server envelope `{data, meta, message}`); blob responses return the full axios response (filename from `Content-Disposition`). Errors in `api.js` reject with the server body plus `httpStatus` (`{message, error?, data:{code}, httpStatus}`; JSON error bodies of blob requests are parsed first); `cacheApi.js` rejects with the bare server body (no `httpStatus`). OTP code `OTP_REQUEST_LIMIT_EXCEEDED` is read from `error.data.code`; the OTP modal also treats `httpStatus === 403` on `PUT /v2/mfa/otp/request` as blocked (closes the modal and shows the message; EL-5580). Raw-`fetch` callers expect `{error, message}` and string-compare messages.
- 401 (except URLs containing `/login` or `/logout`) goes through `handleUnauthorizedError(status, url, body)` in `src/utils/auth.js`, shared by `api.js`, `cacheApi.js`, `http.js` and the raw `fetch` in `containers/Users/Table` (Add/Edit user, EL-5580). If `body.data.code` is `ACCOUNT_DEACTIVATED` or `ACCOUNT_LOCKED` (`SESSION_BLOCKED_CODES`), the previous-path restore is skipped so the next login lands on the default page. Then: session-expired toast, cross-tab broadcast, local logout after the toast time; the request promise never resolves. Other 401 codes are not distinguished. Other 403 responses get no global handling (callers show `message`; account-document availability swallows them).
- Token refresh: warning 5 minutes before expiry, `POST /v2/user/refresh-token` expecting `data.token`.
- Lists use `page`/`pageSize` (or `limit`/`page`), `sort=<col>&order=asc|desc`, column filters as `<columnId>=<value>`.

## Backend endpoints by domain (observed; evidence in `src/app/services/<domain>` and `src/static/endpoints.js`)

**Auth, MFA, Cognito, session:** POST `/login`; POST `/v2/mfa/otp/validate-login`; PUT `/v2/mfa/otp/request`; POST `/v2/mfa/otp/validate-email`; PUT `/v2/mfa/update-status`; GET `/v2/mfa/status`; GET `/oauth/cognito`; POST `/cognito/verify`; GET `/cognito/auth-url/{provider}` (screen passes "Rhythm"); GET `/logout`; POST `/v2/user/refresh-token`; GET `/v2/user/validate-token?token=`; PUT `/v2/user/reset-password`; POST `/v2/user/forgot-password`; POST `/user/resetPassword` (legacy); PUT `/user/changePassword`; GET `/v2/user/profile`; PUT `/v2/user/switch-role/{userId}`. Login response data read: `token, passwordExpired, name, role, userId, user_prefs, clinicName, hasRPMDevices, followingPhysicians, isFollowingPhysician, followingHospitals, isFollowingHospital, clinii_user_id, primary_role` (empty data means MFA OTP pending).

**User administration:** GET `/admin/users`; POST/PUT `/admin/user`; PUT `/admin/user/password`; PUT `/admin/user/deactivate`, `/admin/user/activate`.

**Transmissions worklist and report workflow:** GET `/v2/transmission` (Evoke roles) or `/v2/transmission/clinic` (clinic roles) with `view` (`active|processed|clinic-review|clinic-processed`), paging, `search`, filters, `sort`/`order`; GET `.../count`; GET `/v2/transmission/{reportId}`; GET `/v2/transmissions/report/{reportId}` (PDF blob, `coverPage`, `isHF`, `view`; cached via `cacheApi`); POST `/v2/transmissions/bulk-download`; PUT `/v2/transmissions/process-reports`, `unprocess-reports`; PUT `/v2/transmissions/clinic/sign-reports`, `clinic/bill-reports`, `/v2/transmission/unsign-reports`; PUT `/v2/transmission/archive-reports`, `unarchive-reports`; PUT `/v2/transmissions/clinic-notes`, `/v2/transmissions/clinician-notes`, `/v2/transmission/report-notes`, `/v2/transmission/diagnosis-codes`, `/v2/transmissions/rn-chf-screening-notes`, `/v2/transmission/{reportId}/clinic-note` and `/provider-note`, `/v2/transmission/update-transmission-report/{reportId}`, `/v2/transmission/ehr-notes/{reportId}`; report-note comments `/v2/report-notes/{reportId}/contents/{contentId}/comments`; PATCH `/v2/transmission/audit-status/{reportId}`; PUT `/v2/transmission/{reportId}/assign-physician`; PUT nurse-flagging and alert-status routes; PUT `/hl7job/v2/retry/{reportId}`, `/v2/apiJob/retry/{reportId}`, `/v2/sftp/{reportId}`; GET previous-reports, previous-alerts, report-note-suggestions, billing-history, report banners; tasks per report; GET `/v2/hl7job`, PUT `/hl7job/v2/processBulkHl7Jobs`, `/hl7job/v2/retry`, `/hl7job/v2/update/{jobId}`; ADT `/v2/adt/download/{filename}`, `/adt/get/{query}`. Row keys the table reads include `account, active, assignedPhysician, billable, date, device, device_alert, dob, eSig, evoke_id, hospital, lastBillDate, manufacturer, mrn, name, nextSend, oru, patientAlert, physicians, reportNotes, returned, signedAt, signedBy`.

**Patients:** `/v2/patient/list`, `download-list`, `disconnected-monitors`, `no-show-master-list`, `billing-history`, `enroll`, `create/{serial}`, `new-device/{id}`, `update-active/{id}`, `{id}` and `profile/{id}` (GET/PUT), `patient-information`, `information`, `device-information`, `transmission/{serial}`, `updateBillingSchedule`, `next-send/*`, `insurance` (PUT `/v2/patient/insurance` body `{serialNumber, insuranceType, insurance}`; insurance now also carries `authorization_code`, `treatment_start`, `treatment_end`, empty string when unset; client validates max length and end not before start; server rules per rest-api-evoke EL-5602), `analytics/{id}`, `battery-information/{id}`, `{serial}/reports`, `{id}/tasks`, document fetch/upload/signed-url, medication CRUD, lead-information, `send-letter/{serial}`, `reminder-logs/{id}`, `subscribe-setting/{id}`, notes and note deletion, search endpoints (`recordsByName` with query `value`, `searchByDeviceSerialNumber`, optional `facility` and, new, `account` (omitted when "All"; used by manual-upload patient search; server support per rest-api-evoke EL-5599), `recordsByName`, `recordsByNameOrDobOrEvokeId`, `search-patient`, `patients-by-evoke-id`), `form-settings`, datapoints, `merge-patients`, `update-advisory`, `update-benchmark-id`, `self-pay`, `pre-auth`, `anticoag-status`, `laao-device`, `idtf`; legacy unversioned `/patient/*` family also used; `/v2/hospital`; `/accounts`; `/v2/dashboard/accounts`; GET `/v2/insurances/benchmark`.

**No-show patients and live calls:** `/v2/patient/non-compliant-patient/reminders` and `/{id}/reminder-history`; `/v2/patient/non-enrolled-patients` (+ `/enroll`); POST/PUT `/v2/patient/{id}/live-call`; GET `/v2/patient/no-show-patients/download/overdue`; GET `/v2/live-call-tasks`; PUT `/v2/live-call-tasks/{id}/mark-complete` (`{reason, completionDate}`).

**Tasks and approvals:** the active-tasks list now also maps the `patient` object (`_id, name, serial_number`), and the create/update body (`POST /task/`, `PUT /task/{id}`) carries optional `patientId`, `patientName`, `patientSerialNumber` (EL-5599; server fields not verified here); patient-profile tasks use `POST /task`, `PUT /task/{id}`, `GET /v2/patient/{id}/tasks`. GET `/tasks`, `/tasks/archived`, `/tasks/automated/scheduling`, `/tasks/audited`, `/tasks/audited/archived`, `/v2/patient-note-deletion-requests/pending-approvals`; POST `/task/`, PUT `/task/{id}`, PUT `/tasks/archive`, DELETE `/task`; PATCH `/v2/patient-note-deletion-requests/pending-approvals/{id}/{status}`.

**RPM and communication logs:** GET `/v2/rpm/clinii/signin-portal` (URL for the iframe); GET `/v2/rpm`; `/patient/rpm/btbp/{id}`; `/v2/rpm/{id}/scale-reading`; `/v2/rpm/bp-reading*`; downloads `/v2/rpm/download-*`; `/v2/patient-communication-logs[...]`; POST `/v2/patient/export/late`.

**Letters:** `/v2/letter-template[...]` (GET/POST/PATCH/DELETE, generate, save, update-status, letter-next-send), `/v2/no-show-letter[...]`.

**Reference data and configuration:** `/v2/report-templates[...]`, `/v2/report-note-sections[...]`, `/v2/device-groups[...]`, `/v2/device[...]`, `/v2/device-types[...]`, `/v2/insurances[...]`, `/v2/referring-providers[...]`, `/v2/billing-amount[...]`, `/v2/manufacturers`, `/v2/manufacturer-account[...]`, PUT `/accounts/preferences`, `/v2/alert-configurations[...]`, `/v2/alert-protocol[...]`, `/v2/quick-text-templates[...]`.

**Account documents (new, EL-5597):** GET `/v2/account-documents/{accountId}` returns flags `alert_protocol_available`, `clinic_protocol_available` (read as booleans; any error, including 403 and 404, means no link); GET `/v2/account-documents/{accountId}/{documentType}` with `responseType: blob`, `documentType` one of `alertProtocol`, `clinicProtocol` (API keys, EL-5597). The PDF opens in a browser tab (`AccountDocumentLink`; shown to Evoke roles on report notes and patient reports). Server side exists in rest-api-evoke (same paths). The PUT upload route is not called from the changed files (full-source search not done).

**Notifications:** GET `/v2/notifications` (`page`, `limit`; reads `data.notifications`, `unreadCount`, `itemsCount`, per-recipient `is_read`); PATCH `/v2/notifications/mark-all-read` and `/{id}/read` (no body). EL-5419 changes client state after mark-all-read only; no request change found.

**Notification preferences and alert emails (EL-5536):** GET `/v2/alert-configurations/{account}` is sent only when the current role is Admin or User (other roles get `{}` with no request); PUT `/v2/alert-configurations` body `{account, configurations[{..., notify_configs[]}]}`; other tabs refetch accounts after a save (broadcast). The alert notification modal lets the user choose email recipients per Email config; the report-note save (`handleReportNote`) carries `alertNotifications[]` with `{alert_type, recipients, time_period, notification_method, message_content, timezone, include_transmission_pdf}`, Email configs using the selected subset of configured recipients (at least one required), plus `skipAlertNotification`. Server handling of a recipient subset is `unknown` (not checked in rest-api-evoke).

**Next-send reminders (EL-5475):** PUT `/v2/patient/next-send/update` body `{patientId, billingSchedule, nextBillingDateChanged, nextSendDays, nextSendDate, nextBillingDate}` and PUT `/v2/patient/next-send/{id}/{YYYY-MM-DD}`; no new endpoint or body field for email reminders was found. Email is a channel option in subscribe-setting (`next_send`, PUT `/v2/patient/subscribe-setting/{id}`); what commit 5e788156d changes in the request is `unknown`.

**Quick text templates (EL-5600):** same endpoints (`GET /v2/quick-text-templates`, `POST /add`, `PUT/DELETE /{id}`). The new `useQuickTextTemplates` hook only decides when GET runs (skipped unless account setting `show_quick_text_templates`; refetch on cross-tab signal) and merges client-side pre-set bubbles. No new request.

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

`cacheApi` is used only for the report PDF blob GET (account-document PDFs use plain `api`, no cache), `GET /cognito/auth-url/{provider}`, `POST /cognito/verify` and `POST /v2/report-templates/report-information`; TTL `unknown`. Downloads (blob): report PDFs, bulk reports, patient lists, billing, RPM, doctors csv, user-activity, archived reports xlsx and zip. Uploads (multipart): patient document, manual report, in-office, extract-report-data. Client-side PDF merge/split with pdf-lib. localStorage keys and `BroadcastChannel("redux_sync")` are listed in `data-model.md`.

## What this repository exposes

Browser routes (full table in `architecture.md`): public `/login` (`?wearables=true` shows the Cognito button, `?error=`), `/reset-password?token=`, `/reset/:authToken`, `/auth/cognito` (reads `code`, `id_token`, `error`); protected deep links `/patient/:patientId` and `/patient/report/:reportId` (opened in new tabs); `/tasks/*` reads `?document_id=` to highlight a row. nginx serves static files on port 8080 with an SPA fallback; no health endpoint and no API. `postMessage`: receives only from `https://applications.zoom.us` (`zp-init`, `zp-ready`, `zp-call-ringing-event`, `zp-call-log-completed-event`) and sends `zp-make-call` with origin checks. `frame-ancestors 'self'` forbids embedding by other sites.

## Unknowns

Backend URL per environment, response schemas, cookie names, per-endpoint authorization, socket server owner, Cognito domain and client, Clinii host, cache TTL.
