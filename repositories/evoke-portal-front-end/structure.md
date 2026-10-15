---
repository: evoke-portal-front-end
analyzed_commit: 35b36e323291354f6cb8fe43162c8f0dec9a1478
analyzed_branch: main
analyzed_at: 2026-10-15T08:45:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [git archive of main@79953d3, src/, package.json, jsconfig.json, src/reducers/index.js, src/app/store/index.js, src/utils/auth.js, src/app/store/accountDocument/api/accountDocumentApi.js, src/components/common/accountDocument/AccountDocumentLink.js, src/static/account_document.js, src/hooks/useCloseModalPage.js]
---

# evoke-portal-front-end: Structure (Phase B)

Counts are from the `main@35b36e3` snapshot (1124 files; refreshed 2026-10-15, previously 1116 at `79953d3`).

## Root

`.babelrc`, `.dockerignore`, `.env.example`, `.eslintrc.json`, `.prettierrc`, `.husky/pre-commit`, `craco.config.js`, `jsconfig.json`, `Dockerfile`, `nginx.conf`, `bitbucket-pipelines.yml`, `sonar-project.properties`, `package.json`, `yarn.lock`, `README.md`, `public/` (index.html, pdf.worker.js, manifest.json, robots.txt). `.idea/` and `.vscode/` are tracked although gitignored.

## src/ directory map

| Directory | Files | Contents |
|---|---|---|
| `src/actions` | 5 | Legacy raw-`fetch` thunks (accounts, patients, reports-assignment, tasks, users) |
| `src/app` | 210 | `lib` (api.js, cacheApi.js), `services/<domain>` (27 domain folders; the new `accountDocument` domain is one of them), `store/<domain>` (32 entries incl. `accountDocument`: slice, actions, api, state), `hooks`, `utils` |
| `src/assets` | 18 | images, styles, svgs |
| `src/components` | 602 | `pages/` (470; transmissions 227, dashboard 113, manualUpload 26, nonCompliantPatients 24, tasks 18, ...), `common/` (72; new `accountDocument/AccountDocumentLink.js`, `expandable-chips/ExpandableTags.js`), Hl7Jobs, ReportTemplates, ReportsAssigment, FormFields, Adts, AppShell, AppRoutes, ZoomPhoneEmbed, Modal, ... |
| `src/containers` | 105 | Screens: AppPage (25), PatientRPM (16), Tasks (10), Insurances, ReferringProviders, ManufacturerConfiguration, LetterManagement, Users, Login, DeviceConfiguration, ResetPassword, Billing, PageNotFound, Prohibited |
| `src/hooks` | 10 | useAuth, useCloseModalPage (new), useAuthorization, useSessionExpiry, useSocket, useTranscription, theme and account-type helpers |
| `src/pages` | 41 | Routed pages (liveCallTasks, patients, accountConfiguration, manualUpload, reportTemplates, transmission, tasks, dashboard, archivedReports, billingAmount, cognito, nonCompliantPatients, notificationPreferences, quickTextTemplates, rpm, settings, auth) |
| `src/reducers` | 8 | Legacy classic-Redux reducers |
| `src/schemas` | 27 | yup schemas |
| `src/services` | 3 | auth.service.js, transmissions.js (mostly dead) |
| `src/static` | 13 | constants.js (about 2,000 lines), endpoints.js, account_document.js (new), preferences.js, transcription.js |
| `src/utils` | 39 | auth, routes.util, storage.util, date, pdf, otp, cognito, ... |

41 RTK Query `*Api.js` files live under `src/app/store`.

## Recent structural additions (observed, `35b36e3`)

- `app/store/accountDocument/api/accountDocumentApi.js`, `app/services/accountDocument/accountDocument.js`, `static/account_document.js`, registered in `app/store/index.js:31,81`; `AccountDocumentLink` is used by `ReportNotes.js` and `PatientProfileTabs.js`.
- `transmissions/modal/detail/notes/quick_text_templates/useQuickTextTemplates.js` (hook beside its component).
- `transmissions/modal/detail/notes/report_notes/modals/alert_notification/AlertEmailRecipients.js`.
- `hooks/useCloseModalPage.js`, used by `ReportDetailModal.js` and `usePatientModal.js`.

## Layering (observed)

Screens (`pages/`, `containers/`) use `components/`, which call RTK Query endpoints (`app/store/<domain>/api`) wrapping axios services (`app/services/<domain>`), which call `app/lib/api.js`. Endpoint paths are centralised in `src/static/endpoints.js`.

## Legacy or dead code (observed)

- `src/reducers/{accounts,alerts,patients,upload}.js` are registered; `reports-assignment.js` is not in the root reducer.
- `src/actions/{patients,tasks,users}.js` are still imported by `containers/PatientRPM`, `Tasks`, `Users`.
- `src/utils/fetchWrapper.js` is imported nowhere (verified by grep); `src/utils/useFetch.js` has no importer found.
- `pdfjs-dist ^4.10.38` is declared but not imported (react-pdf brings 2.16.105); `public/pdf.worker.js` unreferenced (inferred).
- `README.md` is stale.
