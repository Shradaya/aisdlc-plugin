---
repository: rest-api-evoke
analyzed_commit: 84768b56f78a3663d6cfb9acf128556c4cdab89f
analyzed_at: 2026-10-15T08:40:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [file listing of the `84768b5` snapshot (git archive), scratchpad changed-files list, app.js, routes/index.js, Dockerfile, .dockerignore, package.json]
---

# Structure (Phase B)

985 files in the `84768b5` snapshot (`find`, includes dotfiles; 961 tracked at `4178ce4`, so +24 net). Counts below are from the snapshot (`find <dir> -type f | wc -l`), except where noted; the prior numbers were `git ls-files` counts and `assets/` differs (see its row). No build step besides `docker build` (see `build-release.md`). 

## Top level

| Path | Files | Role |
|---|---|---|
| `app.js` | 1 | Entry point (middleware, route mount, error handler, DB connect, listen) |
| `routes/` | 59 | URL prefixes. `routes/index.js` mounts everything. `routes/v2/` (48 files, new `account_document.v2.routes.js`) is current; flat `routes/*.js` is legacy v1 |
| `controllers/` | 64 | Request/response handling. `controllers/v2/` 53 files; 11 legacy flat files |
| `services/` | 90 | Business logic. `services/v2/` 61, `services/hl7/` 23 (per-EHR modules + `strategies/`), plus `lambda.js`, `sqs.js`, `scheduling.js`, `transmissions.js`, `updateNextSendInManufacturer.js`, `rpm/clinii/` |
| `repository/` | 69 | DB access layer (`repository/v2/`) |
| `models/` | 83 | Mongoose schemas. `models/v2/` 78 files (new: `account_document.v2`, `activity_log.v2`, `clinic_signature_updates.v2`, `report_cover_page.v2`); 5 flat legacy classes (`activity_log`, `bt_measurements`, `patient`, `report`, `user`), of which `activity_log` and `bt_measurements` now delegate to Mongoose and `patient`, `report`, `user` still use the raw driver |
| `schemas/` | 13 | Legacy v1 schema/collection helpers (`device`, `transmission`, `rpm`, `reportTemplates`, ...) |
| `validators/` | 28 | Joi schemas in `validators/v2/` (23) and legacy express-validator files |
| `middleware/` | 15 | `authorize`, `authorizeService`, Cognito client/scope checks, `rateLimiter`, `cors`, `csp`, `errorHandler`, `inputSanitizer`, `schemaValidator`, activity loggers; `v2/authorizeEnv`, `patientValidator.v2`, `urlEncodedParser`, `userActivityLogger` |
| `util/` | 88 | `util/v2/` 78 files (new `account_document.v2.util.js`, `userStatus.v2.util.js`): AWS S3/SES/SNS/SQS clients, Twilio, Slack, PostGrid, Cognito, Clinii, CardioOne clients, PDF/cover-page generators, in-office parsers per manufacturer (`inOffice/<manufacturer>`), PDF text extraction, secret-manager helpers; flat `util/*.js` (config, constants, date, database, ...) |
| `events/` | 9 | In-process EventEmitters (SFTP, bulk HL7, CardioOne, Clinii, billing task, automated task, patient, user, letter) |
| `common/`, `helpers/` | 10, 2 | (new `common/account_document.js`) Constants (alert protocol, in-office, letters, Twilio, billing schedule, PDF extraction, roles) and `helpers/role.js`, `helpers/patient.js` |
| `database/` | 3 | `database/index.js` (`connectDb`) and two seed scripts under `seed/` |
| `logger/` | 1 | winston logger |
| `templates/` | 20 | HTML cover-page templates (`cover-page/`: `default`, 4 per-account variants, components, styles) and an RPM invoice `.xlsx` |
| `assets/` | 17 in the snapshot (20 at `4178ce4` by `git ls-files`; the difference is unexplained, `unknown`: no change to `assets/` appears in the changed-files list) | Images/icons used in generated documents and letters |
| `tests/` | 379 | mocha specs mirroring source paths (see `testing.md`) |
| `docs/` | 18 | `context/` (PRODUCT, BLUEPRINT, CONSTITUTION), `adr/` (template + record-architecture-decisions), `features/0001-*` (a LANE run), `ROADMAP.md`, `AMENDMENTS.md` |
| `Dockerfile`, `.dockerignore`, `bitbucket-pipelines.yml` | | Container and CI/CD |
| `package.json`, `yarn.lock`, `eslint.config.js`, `.prettierrc`, `.nycrc.json`, `sonar-project.properties`, `.husky/pre-commit`, `.vscode/launch.json`, `.env.example` | | Tooling and config (`.husky/pre-commit` runs `npx lint-staged`) |

## Layering (v2, current code)

`routes/v2/<name>.v2.routes.js` -> `controllers/v2/` -> `services/v2/` -> `repository/v2/` -> `models/v2/`. Legacy v1 (`routes/*.js`, `controllers/*.js`, `models/*.js`, `schemas/*.js`) uses the raw driver through `util/database.js`. Both generations are mounted side by side in `routes/index.js`. Convention details: `conventions.md`.

## Sizes (hotspot hints)

`models/v2` 78 files, `repository/v2` 69, `util/v2` 78, `services/v2` 61, `controllers/v2` 53, `routes/v2` 48. Line counts of the two largest files now: `services/v2/patient.v2.service.js` 4672 lines, `repository/v2/patient.v2.repository.js` 2449 lines (both still the main hotspots; both were touched in this range). Largest files and coupling are listed in `change-impact.md`.

## Not tracked at the analyzed commit (not evidence)

The snapshot has no `.git`, `CLAUDE.md`, `.claude/` or `e2e/`; the list below is carried over from the prior run.

`.env` (local secrets, never read), `CLAUDE.md` (gitignored), `.claude/`, `e2e/` (a local black-box harness), `node_modules/`, `logs/`, `wearlinq sample data/`, `uploads/`, `mnt/`.

## Observations

- Two files named `routes/v2/transmissions.js` and `routes/v2/transmission.v2.routes.js` exist; `/v2/transmissions` is mounted twice (`routes/index.js:78` and `:97`) and `/patient` is shared by `routes/patient.js` and `routes/rpm.js` (`routes/index.js:84-85`) (observed).
- `sonar-project.properties` is present; whether it matches existing paths is checked in `testing.md` (`unknown` here).
