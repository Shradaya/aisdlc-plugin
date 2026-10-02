---
repository: rest-api-evoke
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_branch: main
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [README.md, package.json, app.js, routes/index.js, Dockerfile, bitbucket-pipelines.yml, helpers/role.js, docs/context/PRODUCT.md]
---

# rest-api-evoke: Overview

## Identity (Phase A)

| Item | Value | Status |
|---|---|---|
| Name | rest-api-evoke (`package.json` name `rest-api-evoke-portal`, "rest api service for evoke portal"; README title "Evoke Portal Back End") | observed |
| Remote | `git@bitbucket.org:evoke-medical-care/rest-api-evoke.git` | observed |
| Local path | `${AISDLC_REPOS_ROOT}/rest-api-evoke` (resolved from `claude.env`) | observed |
| Base branch | `main` (local `main` and `origin/main` both at `4178ce4`; working tree clean at onboarding) | observed |
| Analyzed commit | `4178ce47396c524dfd22a4dd107927b3b28eb100` ("Merged in lf-uat (pull request #6135)", 2026-10-01T10:04:31Z) | observed |
| Type | Long-running Express HTTP REST API (one Node process), shipped as a Docker image | observed |
| Language / runtime | JavaScript (CommonJS, no TypeScript); Node 24 (`Dockerfile` `node:24-slim`, `bitbucket-pipelines.yml` `image: node:24`) | observed |
| Main frameworks | Express 4, Mongoose 6 + native `mongodb` 4 driver, Joi (`@hapi/joi`) + legacy `express-validator`, winston, mocha/chai/sinon | observed |
| Size | 961 tracked files; about 85k lines of non-test JS, about 97k lines under `tests/` (367 spec files) | observed |
| History | 7,901 commits; branches `lf-develop`, `lf-qa`, `lf-uat`, `main`, many `EL-<n>` branches; release tags such as `v10.17.00` | observed |
| Package manager | `yarn.lock` is tracked and used by the Dockerfile; `package-lock.json` is gitignored | observed |

## Purpose (as observed in code and docs)

The README states that Evoke Medical Care is a web application giving its clinicians access to data collected by the cardiac devices used by its patient population, with auto-alarming and tracking (`README.md:3`). This repository is the REST API behind that application. From the routes mounted in `routes/index.js` it exposes:

- authentication and users (login, MFA/OTP, Cognito, tokens, user activity logs);
- patients, devices, device types and groups, manufacturers and manufacturer accounts;
- device transmission intake (BodyTrace webhooks, manual upload, in-office upload with per-manufacturer PDF parsers) and reports with notes, templates, banners, assignment and archive;
- alert configuration and protocols, notifications;
- cover-page and PDF generation (Puppeteer, pdf-lib);
- billing amounts, benchmark billing, RPM and Clinii/CardioOne integrations;
- HL7 jobs for clinic EHRs (ADT, ORU, DFT, IDCO via per-client modules in `services/hl7/`), SFTP and API jobs;
- Twilio reminders, live-call tasks, no-show letters (PostGrid), Zoom;
- accounts, hospitals, dashboard and analytics.

Which of these are customer-visible product capabilities and how they fit across repositories is recorded in `system/` after the developer interview (Phase M), not here.

## Roles (observed)

Eight roles in `helpers/role.js`: `admin`, `assistant`, `user`, `clinic`, `clinicReviewer`, `physician`, `clinicAdmin`, `rpmUser`. Per-route authorization is `authorize(roles, key)` (`middleware/authorize.js`). What each role means in business terms is `unknown` (not stated in code; `docs/context/PRODUCT.md` marks its own descriptions as partly inferred).

## Entry points

- `app.js`: loads `dotenv`, builds the Express app, applies CORS, `express.json`, cookie parser, morgan, compression, mounts `routes/index.js`, adds a 404 catch-all and `middleware/errorHandler`, then connects Mongo (`util/database.mongoConnect` and `database/connectDb`) and listens on `config.app.port || 3001`. The server starts as soon as the module is required (`app.js:61`).
- `GET /health-check` returns `OK` (`routes/index.js:69-71`).
- No CLI entry and no scheduler were found at this level; background work is in-process event emitters in `events/` and SQS/SNS/Lambda sends. Details: `architecture.md`.
- `package.json` scripts: `start` (nodemon with dotenv), `dev`, `test`, `test:ci`, `test:file`, `coverage`, `lint`, `format`, `seed:onboardingBilling`, `seed:deviceCategory` (seeds write to the configured database).

## Deployment (summary)

`Dockerfile` (multi-stage, installs Chromium for Puppeteer, runs `node app.js` as user `node`). `bitbucket-pipelines.yml` builds an image and updates a Kustomize image tag in an `evoke-app-manifest` repository for `lf-develop`, `lf-qa`, `lf-uat` and `main` (production). See `build-release.md`.

## Provenance notes

- Analysis used tracked files at `4178ce4` (working tree was clean, so tracked files equal the commit).
- Untracked local files were not treated as evidence: `.env` (never opened; holds secrets), `CLAUDE.md` (gitignored, `.gitignore:8`), `.claude/`, `e2e/` (a locally installed black-box harness), `node_modules/`, `logs/`. Statements from `CLAUDE.md` were used only as leads and re-verified in tracked code.
- `package.json` `repository.url` points to a personal Bitbucket workspace (`jeff_stratorsoft/rest-api-evoke`), while `origin` points to `evoke-medical-care/rest-api-evoke`. The `origin` remote is authoritative for registration.

## Unknowns

- Kubernetes manifests, IAM, queue/topic and Lambda definitions (live in sibling infrastructure repositories not registered here). Checked: repo root, `Dockerfile`, `bitbucket-pipelines.yml`.
- Real database indexes and topology (only indexes declared in Mongoose schemas are visible).
- Meaning of each role in business terms.
