---
repository: evoke-portal-front-end
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_branch: main
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: inferred
confidence: medium
evidence: [import counts by absolute path from the main snapshot (lower bounds), src/containers/AppPage/index.js, src/static/constants.js, src/static/endpoints.js, src/app/store/transmission]
---

# evoke-portal-front-end: Change-impact map (Phase K)

Import counts are by absolute path, so they are lower bounds (relative imports are not counted). The co-change sets below are inferred from structure, not from history.

## Coupling hot spots (observed counts)

| Module | Importing files |
|---|---|
| `static/constants` | 256-278 |
| `utils/toast` | 137 |
| `transmissionSlice` (state hub) | 118 (114 select `state.transmission`) |
| `utils/date` | 109 |
| `utils/string` | 62 |
| `components/Button/SubmitButton` | 55 |
| `app/lib/api` | 54 |
| `ModalWrapper` | 53 |
| `static/endpoints` | 51 |
| `transmissionTableApi` | 39 |
| `patientApi` | 33 |
| `CustomTable` | 29 |

`USER_ROLES` appears in 46 files and `CLINIC_ROLES` in 23. Largest files: `useManualUpload.js` (1304 lines), `PatientBasicInfoForm.js` (1210), `Users/UserModal` (1148), `PatientRPM/Table` (1127), `DeviceInformationForm.js` (988), `useTransmissionTableColumn.js` (968), `NextSendModal.js` (899), `AppPage/index.js` (822).

## Co-change sets by change type (inferred)

- **New page or route:** `containers/AppPage/index.js` (route, role list), `containers/AppPage/Sidenav/index.js` (tab and its duplicated visibility rule), `utils/routes.util.js` and `ROLE_INITIAL_ROUTE`/`USER_ROLES` constants if roles change, the page and a store slice/api.
- **New or changed API field/endpoint:** `src/static/endpoints.js`, the service in `app/services/<domain>`, the RTK Query `api/` file, the slice/state fragment, the consuming components and any yup schema in `src/schemas`; patient shape changes also touch `transmissionPatientModalState.js`, `PatientBasicInfoForm.js` and the profile PUT in `services/transmission/patient.js`.
- **Report or transmission model change:** the `transmission` slice (118 importers), `transmissionTableApi`, table column hooks, report modal and PDF viewer, tab constants (`constants.js:1396-1440`).
- **Auth or role change:** `constants.js` (roles, groups, landing routes), `routes.util.js`, `AppPage` route table, `Sidenav`, `useAuthorization`, `useSettings`, `useAuth` localStorage keys, 46 `USER_ROLES` usages; backend changes in `rest-api-evoke` and the session flow (`useSessionExpiry`, `utils/auth.js`).
- **Shared component or util (SubmitButton, ModalWrapper, CustomTable, toast, date, string):** dozens of consumers; check every screen listed above.
- **Store slice:** root reducer (`src/reducers/index.js`, `src/app/store/index.js`), `RESET_APP_STATE` handling, cross-tab `BroadcastChannel` flags if shared.
- **Env var:** `Dockerfile` build args, all four pipeline branches in `bitbucket-pipelines.yml`, `src/static/constants.js`, `.env.example`; the dev and qa builds currently omit the socket URL.
- **react-pdf or pdf.js upgrade:** `nginx.conf` CSP `script-src` pinned worker URL, `PdfViewer.js`.
- **CSP or nginx change:** security-sensitive; affects embeds (Zoom, Clinii, lcwms), fonts, unpkg worker, `*.emc-portal.com` connect targets.
- **Theme:** `src/evokeTheme.js`, `hooks/useAppTheme.js`, `@mui/styles` users (28 files).

## Cross-repository impact (inferred)

- `rest-api-evoke` contract changes (see `interfaces.md`): the main risk is silent breakage because the UI has no types; `dashboard` endpoints are used by 12 files, `patient` by 7, `transmission` by 4, `auth` by 3.
- Both `/patient/...` and `/v2/patient/...` families are used, so the backend must keep both.
- Raw-`fetch` callers string-compare server messages and expect `{error, message}`; changing message text breaks them.
- `manufacturer-hl7-parser` writes patients, reports and notes that this UI shows via the backend; changes to those entities' shape (report notes, alerts, billing codes) affect the transmissions, patient and report screens (indirect).
- Socket service contract (namespaces and event names) is defined only by this client and an unregistered service.
- Cognito, Clinii and Zoom Phone embeds depend on third-party behavior and the CSP.

## Risk notes

No automated tests, so every change relies on manual verification; production deploys on push to `main` (see `build-release.md`).
