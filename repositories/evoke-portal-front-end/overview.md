---
repository: evoke-portal-front-end
analyzed_commit: 35b36e323291354f6cb8fe43162c8f0dec9a1478
analyzed_branch: main
analyzed_at: 2026-10-15T08:45:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [README.md, package.json, Dockerfile, nginx.conf, bitbucket-pipelines.yml, src/index.js, src/components/AppRoutes/index.js, src/containers/AppPage/index.js, src/static/constants.js, src/app/lib/api.js, src/static/endpoints.js, git archive of main@35b36e3]
---

# evoke-portal-front-end: Overview

Provenance: analysis was made by repository analysts reading an exact `git archive` snapshot of `main@79953d3`; refreshed on 2026-10-15 (partial update of the files touched by the 67-file diff) against a snapshot of `main@35b36e3`. The developer checkout (`${AISDLC_REPOS_ROOT}/evoke-portal-front-end`) was on task branch `EL-5607` with uncommitted edits and was not read. Analyst claims were reconciled by the orchestrator (Phase L); see `metadata.json`.

## Identity (Phase A)

| Item | Value | Status |
|---|---|---|
| Name | evoke-portal-front-end ("Evoke Portal Front End", `README.md:1`) | observed |
| Remote | `git@bitbucket.org:evoke-medical-care/evoke-portal-front-end.git` | observed |
| Local path | `${AISDLC_REPOS_ROOT}/evoke-portal-front-end` (resolved from `claude.env`) | observed |
| Base branch | `main` (`origin/main` at `35b36e3`; local checkout not re-read in the refresh) | observed |
| Analyzed commit | `35b36e323291354f6cb8fe43162c8f0dec9a1478` ("Merged in lf-uat (pull request #6234)", 2026-10-14T10:26:42Z); previously `79953d3` (pull request #6143) | observed |
| Type | Browser single-page application served as static files by nginx; no server code | observed |
| Language | JavaScript only (990 `.js`, 78 `.css`); no TypeScript | observed |
| Framework | React 18.3, Create React App 5 (`react-scripts` 5.0.1) through CRACO 7.1 | observed |
| Size | 1124 files in the snapshot, 1088 under `src/` | observed |

Package manager is Yarn classic (`yarn.lock`, `Dockerfile`); `README.md` says `npm` and is stale. Node is `node:20-slim` in the Dockerfile.

## Purpose (as observed in code)

`README.md:3`: a web application that gives Evoke clinicians access to the data collected by the cardiac devices used by its patient population, with auto-alarming and tracking capabilities.

Developer-confirmed (2026-10-01, add-repo interview): clinician and staff web portal for Evoke operators and partner-clinic staff; REST API is `rest-api-evoke`; realtime namespaces are served by a separate socket service (repository not named); the portal owns no persistent data.

## Major UI areas (observed, `src/containers/AppPage/index.js`)

Transmission worklists (Evoke roles and clinic roles), report detail, patients, RPM (`/rpm` Clinii embed), no-show patients and live-call tasks, tasks, dashboard, manual upload, archived reports, reports assignment, billing and billing amount, EHR jobs, settings, account configurations, report templates, CardioOneConnect (`/wearables`). Eight roles: admin, user, assistant, clinic, clinicReviewer, physician, clinicAdmin, rpmUser. The full route and role table is in `architecture.md`.

## Integrations visible in the client (observed)

Backend REST API at `REACT_APP_BASE_URL`; socket.io at `REACT_APP_SOCKET_SERVER_URL` (namespaces reportPresence, transcribe, notifications; enabled only for `prod` and `pre`); AWS Cognito via backend endpoints; Zoom Phone iframe; account-document PDFs (alert protocol, clinic protocol) fetched from `/v2/account-documents/:accountId[/:documentType]` and opened in a new tab for Evoke roles (`src/static/endpoints.js:280`, `src/components/common/accountDocument/AccountDocumentLink.js`); Clinii RPM iframe (URL from API); Benchmark outbound links; pdf.js worker from unpkg. `https://evoke.lcwms.co` appears only in the nginx CSP; purpose `unknown`.

## Recent changes (refresh to `35b36e3`; code plus commit subjects)

EL-5597 account documents; EL-5580 session handling; EL-5599 tasks with an assignable patient; EL-5602 insurance authorization code and treatment dates; EL-5536 notification preferences, alert email recipients and `ExpandableTags`; EL-5600 quick text templates; EL-5475 email reminders for next-send alerts; EL-5409, EL-5664 and EL-5607 report and patient modal and tab behavior; EL-5419 notification mark-all-read. Details are in `structure.md`, `data-model.md` and `security.md`.

## Unknowns

Route-by-route mapping to `rest-api-evoke`; purpose of `evoke.lcwms.co`; per-environment `REACT_APP_*` values; `APP_ENV` values beyond `prod` and `pre`; reachability of legacy code (see `structure.md`); backend contract of `/v2/account-documents/*` (only the client is visible).
