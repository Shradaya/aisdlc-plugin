---
repository: evoke-portal-front-end
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_branch: main
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/index.js, src/components/AppRoutes/index.js, src/containers/AppPage/index.js, src/containers/AppPage/Sidenav/index.js, src/static/constants.js, src/utils/routes.util.js, src/hooks/useSocket.js, src/hooks/useSessionExpiry.js, src/app/store/index.js, src/app/lib/api.js]
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

41 `createApi` modules with 188 `queryFn` endpoints (`fetchBaseQuery` configured but unused); 0 `createAsyncThunk`. The `actions/` folders under `app/store` are reducer maps, not thunks. The root reducer holds 41 RTK Query reducers, 29 domain slices and 5 legacy reducers; `RESET_APP_STATE` resets on role switch. The `transmission` slice is the global UI hub (118 files import it). About 50 query call sites use `refetchOnMountOrArgChange: true`. A legacy raw-`fetch` layer (`src/actions/*`) still feeds PatientRPM, Tasks, Users and ReportsAssigment, without 401 handling.

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

Password login (`POST /login`) may lead to an OTP step; Cognito login via `GET /oauth/cognito` and `POST /cognito/verify`. JWT in `localStorage.authToken`. `useSessionExpiry` warns 5 minutes before `exp` and extends via `POST /v2/user/refresh-token`; cross-tab expiry uses the `storage` event; any 401 triggers the expiry flow. Role switching: `PUT /v2/user/switch-role/{userId}`, then state reset and an `AppPage` remount.

## Realtime (observed)

`useSocket` is ref-counted per namespace and user, enabled only when `REACT_APP_ENV` is `prod` or `pre`. `reportPresence` (join, 15 s heartbeat, table-row presence), `notifications` (triggers refetch), `transcribe` (16 kHz PCM from note editors). Other timers: OTP countdown and session expiry. `BroadcastChannel` syncs device-list and quick-text refetch between tabs.

## Files and PDFs (observed)

react-pdf 6.2.2 loads its worker from `unpkg.com`; the CSP whitelists exactly `pdfjs-dist@2.16.105`. Uploads are multipart; pdf-lib merges and splits PDFs in the browser; report PDFs are fetched as blobs (cached).

## Configuration and deployment (observed)

Three env vars only, read in `src/static/constants.js`, baked in at build time. Deployment details in `build-release.md`.

## Unknowns

Backend authorization enforcement, token lifetime, cookie use; socket server behavior; runtime `REACT_APP_ENV` values; `eks-yml-manifest` overlays; why `pdfjs-dist@^4` is a direct dependency. Most of `components/pages/**`, `src/schemas/*` and dashboard chart code were not read in depth.
