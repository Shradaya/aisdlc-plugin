---
repository: evoke-portal-front-end
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_branch: main
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [package.json, yarn.lock, Dockerfile, nginx.conf, bitbucket-pipelines.yml, craco.config.js, src/static/constants.js, public/index.html]
---

# evoke-portal-front-end: Dependencies (Phase D)

## Build and tooling (observed)

Create React App 5 through CRACO 7.1.0 (`react-scripts` 5.0.1). Yarn classic; `yarn.lock` has 1455 entries. README says npm (contradiction). Node from `node:20-slim`; no `.nvmrc` or `engines`. Runtime image `nginx:1.22`.

## Direct runtime packages (declared range, locked version)

- UI and routing: react and react-dom ^18.3.1, react-router(-dom) ^6.8.1 (6.30.6), @mui/material 5.16.4 (exact), @mui/styles ^5.16.4 (legacy JSS, 27 files), @mui/x-date-pickers ^7.4.0, material-react-table ^2.12.1.
- State: @reduxjs/toolkit ^1.9.2 (1.9.7; RTK Query used as `queryFn` wrappers), react-redux 8.1.3, redux-thunk 2.4.2.
- HTTP and realtime: axios ^1.3.1 (1.20.0), axios-cache-interceptor 1.0.1 (exact), socket.io-client ^4.8.3.
- Forms and UI utilities: formik 2.4.9, yup 1.7.1, react-dropzone, react-imask, react-toastify 10.0.6, js-file-download.
- Charts: chart.js 4.5.1 with react-chartjs-2 and chartjs-plugin-datalabels, recharts 2.15.4.
- PDF: react-pdf ^6.2.2 (bundles pdfjs-dist 2.16.105) and pdf-lib 1.17.1.
- Dates (three libraries): dayjs (36 files), moment 2.30.1 (12), date-fns 2.30.0 (3), moment-timezone (2).
- Utilities: lodash, clsx, cuid.

Build-only packages declared under `dependencies`: react-scripts, @craco/craco, @babel/cli, core, preset-env, register (the babel packages are never imported in `src/`). `devDependencies`: eslint 8.57.1 and plugins, prettier, husky 8, lint-staged 15. No test-only packages.

`resolutions` (`package.json`): `@mui/utils` 5.17.1, `webpack` 5.110.1; reason not recorded (`unknown`).

## Risks and anomalies

1. **Lockfile drift:** `moment-timezone ^0.6.3` is declared but missing from `yarn.lock` (verified: 0 entries). `Dockerfile` runs plain `yarn` (no `--frozen-lockfile`), so builds are not reproducible for it.
2. **Two pdf.js copies:** `pdfjs-dist ^4.10.38` is declared but never imported; `public/pdf.worker.js` (about 2 MB) is unreferenced (inferred).
3. **pdf.js worker from CDN:** `PdfViewer.js:13` loads `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`; the CSP allows exactly `@2.16.105`. Upgrading react-pdf requires a matching `nginx.conf` change.
4. **Undeclared imports:** `uuid`, `prop-types`, `redux`, and `mini-css-extract-plugin` (craco config) work only through transitive installs. `@devexpress/dx-react-*` is imported only in an unreachable file (`PatientRPM/Chart/index.js`).
5. **Dead or legacy code:** see `structure.md`.
6. **CI gaps:** no test, lint, audit or Sonar step; `DISABLE_ESLINT_PLUGIN=true`.
7. **Global axios mutation:** `setupCache(Axios)` attaches the cache to the global instance.
8. `nginx:1.22` and CRA/moment being unmaintained are inferred from general knowledge, not checked against the registry.

## Runtime configuration (names only)

`REACT_APP_BASE_URL`, `REACT_APP_SOCKET_SERVER_URL`, `REACT_APP_ENV` (compiled in at build time; `.env.example` lists exactly these). No other `process.env` use except `NODE_ENV` and `PUBLIC_URL`. Pipeline variable names are in `security.md`.

## External systems reached from the browser (observed unless marked)

1. Evoke REST backend at `REACT_APP_BASE_URL` (developer: `rest-api-evoke`); CSP allows `https://*.emc-portal.com`.
2. Socket.io server (namespaces reportPresence, transcribe, notifications); developer-confirmed separate realtime service, repository not named.
3. AWS Cognito hosted sign-in (login and CardioOneConnect hand-off) via URLs from the backend; Cognito domain `unknown`.
4. Zoom Phone embeddable (`applications.zoom.us`) with `postMessage`.
5. Clinii RPM portal iframe (URL from `GET /v2/rpm/clinii/signin-portal`; host `unknown`).
6. `evoke.lcwms.co`: CSP only; purpose `unknown`.
7. Benchmark practice-management web app: outbound link only (`constants.js:1820`).
8. unpkg.com (pdf.js worker), Google Fonts, cdnjs (flexboxgrid).
9. CSP report URI `https://*.emc-portal.com/csp/report` (wildcard, inferred ineffective).
10. Speech-to-text behind the `transcribe` namespace (16 kHz PCM, en-US); vendor not visible (Amazon Transcribe is a guess).

## Build and deploy dependencies (observed)

Bitbucket Pipelines (branch pipelines only); agent images `public.ecr.aws/c7j4d3u2/{build,deploy}-agent-image:latest`; AWS ECR via OIDC role; `eks-yml-manifest` repository (kustomize overlays dev, qa, pre-prod, prod; not registered); nginx static hosting.

## Relationship edges

| From | To | Kind | Registered | Status |
|---|---|---|---|---|
| evoke-portal-front-end | rest-api-evoke | api | being registered in parallel | human-confirmed (developer, 2026-10-01); URL mapping unverified |
| evoke-portal-front-end | socket service (unnamed) | event (websocket) | no | human-confirmed that it is a separate service; repo unknown |
| evoke-portal-front-end | AWS Cognito | third-party | no | human-confirmed |
| evoke-portal-front-end | Clinii | third-party | no | human-confirmed |
| evoke-portal-front-end | Zoom Phone | third-party | no | human-confirmed |
| evoke-portal-front-end | Benchmark | outbound link | no | observed |
| evoke-portal-front-end | manufacturer-hl7-parser | indirect data via backend and shared MongoDB | yes | human-confirmed as indirect only |
| evoke-portal-front-end | eks-yml-manifest | deployment manifests | no | observed; developer asked that it not be recorded as a system edge |

The front end has no database, S3, SQS or Lambda client and no direct edge to `hl7-file-sync-service`, `billing-schedule-lambda`, `benchmark-sqs-consumer` or `cardio-one-sqs-consumer`.

## Unknowns

Backend URL per environment; socket server owner; Cognito domain and client; Clinii host; purpose of the `lcwms` CSP entry; axios-cache-interceptor effective TTL; cookie names; per-endpoint server authorization; response schemas; `eks-yml-manifest` rollout; Sonar server; reason for the `webpack` and `@mui/utils` resolutions; whether the cross-origin pdf.js worker works under the CSP in all browsers.
