---
repository: evoke-portal-front-end
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_branch: main
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [git archive of main@79953d3, src/, package.json, jsconfig.json, src/reducers/index.js, src/app/store/index.js]
---

# evoke-portal-front-end: Structure (Phase B)

Counts are from the `main@79953d3` snapshot (1116 tracked files).

## Root

`.babelrc`, `.dockerignore`, `.env.example`, `.eslintrc.json`, `.prettierrc`, `.husky/pre-commit`, `craco.config.js`, `jsconfig.json`, `Dockerfile`, `nginx.conf`, `bitbucket-pipelines.yml`, `sonar-project.properties`, `package.json`, `yarn.lock`, `README.md`, `public/` (index.html, pdf.worker.js, manifest.json, robots.txt). `.idea/` and `.vscode/` are tracked although gitignored.

## src/ directory map

| Directory | Files | Contents |
|---|---|---|
| `src/actions` | 5 | Legacy raw-`fetch` thunks (accounts, patients, reports-assignment, tasks, users) |
| `src/app` | 208 | `lib` (api.js, cacheApi.js), `services/<domain>` (27 domain folders), `store/<domain>` (about 31 domains: slice, actions, api, state), `hooks`, `utils` |
| `src/assets` | 18 | images, styles, svgs |
| `src/components` | 598 | `pages/` (468; transmissions 225, dashboard 113, manualUpload 26, nonCompliantPatients 24, tasks 18, ...), `common/` (70), Hl7Jobs, ReportTemplates, ReportsAssigment, FormFields, Adts, AppShell, AppRoutes, ZoomPhoneEmbed, Modal, ... |
| `src/containers` | 105 | Screens: AppPage (25), PatientRPM (16), Tasks (10), Insurances, ReferringProviders, ManufacturerConfiguration, LetterManagement, Users, Login, DeviceConfiguration, ResetPassword, Billing, PageNotFound, Prohibited |
| `src/hooks` | 9 | useAuth, useAuthorization, useSessionExpiry, useSocket, useTranscription, theme and account-type helpers |
| `src/pages` | 41 | Routed pages (liveCallTasks, patients, accountConfiguration, manualUpload, reportTemplates, transmission, tasks, dashboard, archivedReports, billingAmount, cognito, nonCompliantPatients, notificationPreferences, quickTextTemplates, rpm, settings, auth) |
| `src/reducers` | 8 | Legacy classic-Redux reducers |
| `src/schemas` | 27 | yup schemas |
| `src/services` | 3 | auth.service.js, transmissions.js (mostly dead) |
| `src/static` | 12 | constants.js (about 2,000 lines), endpoints.js, preferences.js, transcription.js |
| `src/utils` | 39 | auth, routes.util, storage.util, date, pdf, otp, cognito, ... |

About 40 RTK Query `*Api.js` files live under `src/app/store`.

## Layering (observed)

Screens (`pages/`, `containers/`) use `components/`, which call RTK Query endpoints (`app/store/<domain>/api`) wrapping axios services (`app/services/<domain>`), which call `app/lib/api.js`. Endpoint paths are centralised in `src/static/endpoints.js`.

## Legacy or dead code (observed)

- `src/reducers/{accounts,alerts,patients,upload}.js` are registered; `reports-assignment.js` is not in the root reducer.
- `src/actions/{patients,tasks,users}.js` are still imported by `containers/PatientRPM`, `Tasks`, `Users`.
- `src/utils/fetchWrapper.js` is imported nowhere (verified by grep); `src/utils/useFetch.js` has no importer found.
- `pdfjs-dist ^4.10.38` is declared but not imported (react-pdf brings 2.16.105); `public/pdf.worker.js` unreferenced (inferred).
- `README.md` is stale.
