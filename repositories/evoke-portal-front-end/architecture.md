---
repository: evoke-portal-front-end
analyzed_commit: 35b36e323291354f6cb8fe43162c8f0dec9a1478
analyzed_branch: main
analyzed_at: 2026-10-15T08:45:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/index.js, src/components/AppRoutes/index.js, src/containers/AppPage/index.js, src/containers/AppPage/Sidenav/index.js, src/static/constants.js, src/utils/routes.util.js, src/hooks/useSocket.js, src/hooks/useSessionExpiry.js, src/app/store/index.js, src/app/lib/api.js, src/app/lib/cacheApi.js, src/utils/http.js, src/utils/auth.js, src/components/common/accountDocument/AccountDocumentLink.js, src/utils/pdf.js, src/hooks/useCloseModalPage.js, src/utils/broadcastChannel.js, src/reducers/index.js]
---

# evoke-portal-front-end: Architecture (Phase C)

## Stack and entry points (observed)

React 18.3 SPA on CRA 5 + CRACO 7; Redux Toolkit 1.9.7, MUI 5.16.4, react-router 6, axios. Shipped as a static bundle behind nginx (port 8080); no server code. `src/index.js`: Redux `Provider` > `ThemeProvider` > `LocalizationProvider` (dayjs) > `AppShell` (`BrowserRouter`) > `AppRoutes`, plus a `ToastContainer`. No error boundary, no Sentry or analytics, no i18n, no feature-flag SDK; the service worker is unregistered.

## Request path (observed)

```
component -> RTK Query hook (app/store/<domain>/api, queryFn) -> service (app/services/<domain>)
          -> app/lib/api.js (axios, Bearer token, withCredentials) -> REST API (rest-api-evoke)
component -> useSocket (socket.io, ref-counted per namespace) -> realtime service (reportPresence, notifications, transcribe)
```

42 `createApi` modules (41 earlier plus `accountDocumentApi`; the earlier count of 188 `queryFn` endpoints was not re-counted) (`fetchBaseQuery` configured but unused); 0 `createAsyncThunk`. The `actions/` folders under `app/store` are reducer maps, not thunks. The root reducer (`src/reducers/index.js`) now also registers `accountDocumentApi` (reducer there, middleware in `app/store/index.js`); the earlier counts (41 RTK Query reducers, 29 slices, 5 legacy) were not re-counted; `RESET_APP_STATE` resets on role switch. The `transmission` slice is the global UI hub (118 files import it). About 50 query call sites use `refetchOnMountOrArgChange: true`. A legacy raw-`fetch` layer (`src/actions/*`) still feeds PatientRPM, Tasks, Users and ReportsAssigment. 401 handling there is partial: `containers/Users/Table/index.js` (Add User) now routes a 401 through `handleUnauthorizedError`; `utils/fetchWrapper.js` (a `window.fetch` patch doing the same) has no importer in the snapshot, so it is likely inactive (inferred); other raw-`fetch` callers were not checked.

## Routing and guards (observed)

`AppRoutes`: `/` redirects to `/login` or the role landing route; public `/login`, `/reset-password`, `/reset/:authToken`, `/auth/cognito`; protected `/logout` and `/*` (renders `containers/AppPage`, which holds the in-app route table). The sidebar (`Sidenav/index.js`) duplicates the role rules by hand; a plain `rpmUser` sees Dashboard and Patients in the nav but the routes send it to `/prohibited` (inferred). Nested `/billing/:view`, `/settings/:view`, `/account-configurations/:view` elements are unguarded but the parent guard is effective (inferred from React Router semantics).

## Role model (observed, `src/static/constants.js:945-994`)

| Group | Roles |
|---|---|
| `EVOKE_ROLES` | `admin`, `user`, `assistant` |
| `CLINIC_ROLES` | `clinic`, `physician`, `clinicAdmin` |
| clinic-side but outside `CLINIC_ROLES` | `clinicReviewer` (commented out of the list) |
| RPM-only | `rpmUser` |

Landing routes (`ROLE_INITIAL_ROUTE`): admin and user `/transmissions`; assistant `/tasks`; clinicAdmin, clinic, clinicReviewer `/transmissions/clinic`; physician `/transmissions/clinic-review`; rpmUser `/rpm`. Guard data comes only from localStorage (`authToken`, `userRole`, `role`, `clinicName`, `hasRPMDevices`, `clinii_user_id`, `primaryRole`); the `role` key is `"clinic"` for every `CLINIC_ROLES` member. "Authenticated" means a non-empty `authToken`, so guards are UX gating; backend enforcement is `unknown`. Per-account flags in the `accountsMapper` state act as data-driven feature flags (`settings.show_quick_text_templates`, `settings.show_only_assigned_reports`, `role_preferences.<feature>.<field>`, `saas_account`, `rpm_only`, `medical_center_id`). Tenant behavior is also hard-coded by clinic name (e.g. Centra).

## In-app route table (observed, `containers/AppPage/index.js`)

Ad=admin, Us=user, As=assistant, Cl=clinic, Ph=physician, CA=clinicAdmin, CR=clinicReviewer, RP=rpmUser.

| Path | Roles | Condition |
|---|---|---|
| `/patients` | Us Ad Cl Ph As CA CR | |
| `/patient/rpm` (legacy RPM view) | Ad As Us CA Cl Ph CR | clinic roles need `hasRPMDevices` |
| `/rpm` (Clinii iframe) | Ad Us As CA Cl Ph CR RP | `clinii_user_id` set |
| `/no-show-patients`, `/no-show-patients/non-enrolled-patients`, `/no-show-patients/live-call-tasks` | Ad Us | |
| `/dashboard` | Us Ad Cl Ph As CA CR | |
| `/upload` | Ad Us CA, plus clinic roles allowed by account `role_preferences.manual_upload.report_upload` | |
| `/prohibited` | open | |
| `/tasks`, `/tasks/archived`, `/tasks/automated`, `/tasks/audited`, `/tasks/audited-archived`, `/tasks/pending-approvals` | Us Ad As CA | |
| `/patient/report/:reportId`, `/patient/:patientId` | any authenticated | |
| `/transmissions`, `/transmissions/processed` | Ad Us As | clinic roles redirected |
| `/transmissions/clinic` | Cl Ph CR CA | |
| `/transmissions/clinic-review` | Ph Cl CA | |
| `/transmissions/clinic-processed` | Cl Ph CA | |
| `/billing` (+ `/:view`: insurances, referring-providers) | Ad | |
| `/settings` (+ `/:view`: users, devices, manufacturerAccount, quick-text-templates) | Ad CA RP, plus Cl Ph when `show_quick_text_templates` | tabs also gated in `useSettings.js` |
| `/reports-assignment` | CA Cl Ph CR | clinic name = Centra and a `CLINIC_ROLES` user |
| `/ehr-jobs/hl7jobs`, `/ehr-jobs/apijobs` | Ad CA | |
| `/report-templates` (+ `/:view`: templates, notes, device-groups) | Us Ad As CA | `device-groups` gated in component |
| `/archived-reports` | Ad Ph CA Cl | |
| `/billing-amount` | Ad CA | |
| `/account-configurations` (+ `/:view`: preference, alert-notification, alert-protocol) | Ad | |
| `/wearables` (CardioOneConnect) | Ph | `primaryRole` physician, Cognito login (`idp_user`), account has `medical_center_id` (sidebar tab) |
| `*` | `PageNotFound` | |

## Authentication and session (observed)

Password login (`POST /login`) may lead to an OTP step; Cognito login via `GET /oauth/cognito` and `POST /cognito/verify`. JWT in `localStorage.authToken`. `useSessionExpiry` warns 5 minutes before `exp` and extends via `POST /v2/user/refresh-token`; cross-tab expiry uses the `storage` event; the 401 flow is described below. Role switching: `PUT /v2/user/switch-role/{userId}`, then state reset and an `AppPage` remount.

### 401 and session-expiry handling (observed, changed)

All three axios clients call `handleUnauthorizedError(status, url, body)` from `utils/auth.js` in their response interceptor: `app/lib/api.js`, `app/lib/cacheApi.js` (axios-cache-interceptor wrapping the global `Axios`; inferred that its interceptors therefore attach to the global axios instance) and `utils/http.js` (used by `services/transmissions.js`). How this was wired before was not re-verified. Behavior: ignore non-401 and `/login`/`/logout` URLs; if body `data.code` is in `SESSION_BLOCKED_CODES` (`ACCOUNT_DEACTIVATED`, `ACCOUNT_LOCKED`) set `skipPreviousPathRestore`, so the next login lands on the default page, not `previousPath`; if a token exists call `triggerSessionExpiry()` (once per session via `sessionExpiryHandled`: error toast, writes `SESSION_EXPIRY_BROADCAST` to localStorage so other tabs expire silently, forced logout after `TOAST_AUTO_HIDE_TIME` (2 s) only if the token is unchanged), else `handleLogout(true)`. It returns a never-settling promise, so callers of a 401 request neither resolve nor reject. `api.js` and `cacheApi.js` pass Blob responses through unwrapped; `api.js` also parses JSON error bodies of blob requests. Login and the OTP modal show the server message on a 403 (EL-5580).

### Account documents (observed, new)

`AccountDocumentLink` (used in `ReportNotes.js` as "Alert Protocol" and in `PatientProfileTabs.js`) renders only for `EVOKE_ROLES` and only when `GET /v2/account-documents/:accountId` (RTK Query `accountDocumentApi`; any error maps to "not available") reports `alert_protocol_available` or `clinic_protocol_available` (`static/account_document.js`). On click it calls `window.open("", "_blank")` synchronously (popup-blocker safe), then fetches `GET /v2/account-documents/:accountId/:documentType` through `api` with `responseType: "blob"`, checks the blob is `application/pdf`, sets the PDF title with pdf-lib (`loadPdfWithTitle` in `utils/pdf.js`, falls back to the original blob), injects a full-page `iframe` with an object URL into the new tab and revokes the URL after 60 s (`OBJECT_URL_REVOKE_DELAY_MS`); on failure it closes the tab and shows a toast. A ref prevents double clicks. Backend authorization of these endpoints is unknown.

### Modal-only pages (observed, new)

`hooks/useCloseModalPage.js` serves pages that show only a modal (single report `/patient/report/:reportId`, patient profile `/patient/:patientId`): closing calls `window.close()` when history length is 1 (`keepTab` prevents it), else `navigate(-1)` when the location has history, else navigates to the role initial route (`getRoleInitialRoute`) with replace, avoiding the saved `previousPath` (which points at the same page). `ReportDetailModal` calls it when `selectedTab === SINGLE`; `usePatientModal` when a `patientId` is in the URL. `AppPage` conditionally hides part of its layout when `isReportDetailModal` is set. Details of "one report modal" (EL-5664) and the multi-tab Save fix (EL-5607) were not established beyond this.

### Tasks, notifications and preferences (observed)

- Task modal: `TaskModal`/`useTaskModal` add an optional patient (`SearchPatient`, reused from manual upload); `saveTask` sends `patientId`, `patientName`, `patientSerialNumber` (omitted when empty) through `tasksApi.saveTask` and `taskService`; the form errors when the patient's account differs from the chosen account; the patient card is read-only on edit (PUT). Backend task contract is unknown.
- Notifications: `notificationApi` (single cache key, pages merged by id, `forceRefetch` on page change); `markAllAsRead` and `markAsRead` invalidate the `Notifications` tag so the list refetches (EL-5419).
- Notification preferences: `getNotificationPreferences` reads the role via `getCurrentUserRole()` and fetches per-account preferences only for `admin` and `user`, otherwise returns `{}`. After a save, `broadcastAccountsRefetch()` invalidates the `accounts` tag in this tab and posts `refetchAccounts` on the BroadcastChannel so other tabs refetch.
- Alert notification modal: `useAlertNotification` keeps `selectedRecipients` per message group; for Email configs the payload `recipients` come from the selection (`AlertEmailRecipients`, `ExpandableTags`), otherwise from the config; every email config needs at least one recipient; the payload also carries `alert_type`, `time_period`, `notification_method`, `message_content`, `timezone`, `include_transmission_pdf`. Recipients originate in Notification Preferences.
- Quick text templates: new `useQuickTextTemplates(account, {ownTemplatesOnReviewOnly})` returns pre-set options (physician, Clinic Review tab, Cardio Check accounts, `settings.show_physician_note_options`, not archived) and own templates (`settings.show_quick_text_templates`); it refetches when the cross-tab `quickTextTemplate.shouldRefetch` flag flips.

## Realtime (observed)

`useSocket` is ref-counted per namespace and user, enabled only when `REACT_APP_ENV` is `prod` or `pre`. `reportPresence` (join, 15 s heartbeat, table-row presence), `notifications` (triggers refetch), `transcribe` (16 kHz PCM from note editors). Other timers: OTP countdown and session expiry. `BroadcastChannel` syncs device-list, quick-text and accounts refetch between tabs; the `storage` event carries session expiry.

## Files and PDFs (observed)

react-pdf 6.2.2 loads its worker from `unpkg.com`; the CSP whitelists exactly `pdfjs-dist@2.16.105`. Uploads are multipart; pdf-lib merges and splits PDFs in the browser; report PDFs are fetched as blobs (cached); account-document PDFs are fetched as blobs and shown in a new tab (see above).

## Configuration and deployment (observed)

Three env vars only, read in `src/static/constants.js`, baked in at build time. Deployment details in `build-release.md`.

## Unknowns

Backend authorization enforcement (including `/v2/account-documents`), whether `utils/fetchWrapper.js` is loaded anywhere, the task contract for patient assignment, the exact diffs of EL-5664 and EL-5607, token lifetime, cookie use; socket server behavior; runtime `REACT_APP_ENV` values; `eks-yml-manifest` overlays; why `pdfjs-dist@^4` is a direct dependency. Most of `components/pages/**`, `src/schemas/*` and dashboard chart code were not read in depth.
