---
repository: rest-api-evoke
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [package.json, .nycrc.json, eslint.config.js, .prettierrc, .husky/pre-commit, bitbucket-pipelines.yml, sonar-project.properties, Dockerfile, .dockerignore, .gitignore, .env.example, app.js, routes/index.js, util/config.js, tests/**, docs/AMENDMENTS.md, docs/context/CONSTITUTION.md, docs/features/0001-enhancement-add-transmission-type-filter-to-archived-reports-view/tasks/T-add-transmission-type-filter-to-archived-reports-view-hmet89/verification.md]
---

# Testing profile (Phase G)

Static study of tracked files only. No test, lint, install or app command was run, so pass/fail status, coverage percentages and runtime are `unknown`. Untracked local `CLAUDE.md`, `.claude/` and `e2e/` (a locally synced black-box harness excluded through `.git/info/exclude`) are not part of the analyzed commit; they were used only as leads, and every claim below is verified in tracked code. Counts are from `git ls-files` and `git grep` at the analyzed commit.

## Frameworks

Observed (`package.json:79-101`):

- Runner: `mocha` ^11.8.0. Assertions: `chai` ^6.2.2 (all 367 spec files use `expect(...)`; one uses `assert.`), `chai-as-promised` ^8.0.2 (29 files), `sinon-chai` ^4.0.1 (73 files, registered per file with `chai.use(sinonChai.default || sinonChai)`, e.g. `tests/controllers/admin.spec.js:6`).
- Mocking: `sinon` ^22.1.0 (312 files), `proxyquire` ^2.1.3 (179 files), `aws-sdk-mock` ^6.2.2 (7 files; note production code uses AWS SDK v3 `@aws-sdk/client-*`, so what it still mocks is `unknown`).
- Real in-memory database: `mongodb-memory-server` ^11.2.0 (9 files: 8 under `tests/models/` plus `tests/repository/token.v2.repository.spec.js`).
- CI report: `mocha-junit-reporter` 2.2.1. Coverage: `nyc` ^18.0.0.
- Quality tooling: `eslint` ^10.10.0 (`eslint.config.js`, flat config, `@eslint/js` recommended + `eslint-config-prettier`), `prettier` ^3.9.6 (`.prettierrc`: semicolons, 2 spaces, double quotes, `trailingComma: es5`), `husky` ^9.1.7 + `lint-staged` ^17.5.0.
- Not installed (observed in `package.json`): `supertest`, `nock`, `jest`, any contract, load or security test tool.
- Mocha configuration: no `.mocharc.*` is tracked and `package.json` has no `mocha` key, so Mocha defaults apply (2000 ms timeout, no `--exit`). Slow files override with `this.timeout(...)`: 60000 for the 9 in-memory-Mongo files, 5000 to 10000 for 5 others (grep `this.timeout`). No `.only`, `.skip`, `xit`, `xdescribe` or `this.skip` exists in `tests/`.
- Module system: CommonJS everywhere (`sourceType: "script"` in `eslint.config.js:28`; no `"type"` in `package.json`; no `import` in `tests/`). `chai` 6 is an ES-module package that the specs load with `require("chai")` (454 occurrences). That works only where Node can `require()` ESM (inferred, unverified; CI and Docker use Node 24). No `engines` field and no `.nvmrc` are tracked, so the local Node version policy is `unknown`.

## Test Layers

Suite size (observed): 367 spec files under `tests/`, about 97,085 lines, about 4,517 `it(` and 1,764 `describe(` lines. Every tracked file under `tests/` is a `*.spec.js`, so the 367 files are all matched by the `npm test` glob. Distribution by directory: `controllers` 58 (46 under `v2/`), `routes` 56 (46 `v2/`), `services` 74 (54 `v2/`, 14 `hl7/`, 1 `rpm/`, 5 root), `repository` 60, `util` 74 (64 `v2/`), `validators` 23 (18 `v2/`), `middleware` 13 (4 `v2/`), `models` 8, `events` 1. `tests/` mirrors the source tree (`docs/context/CONSTITUTION.md:108-110`).

| Layer | Framework | Command | Scope | Prerequisites | CI stage | Required for merge | Typical runtime | Test data strategy | Known failures/flakiness |
|---|---|---|---|---|---|---|---|---|---|
| unit | mocha + chai + sinon + proxyquire | `npm test` (`mocha 'tests/**/*.spec.js'`, `package.json:51`); one file: `npx mocha tests/<path>.spec.js` | About 358 of the 367 files. Controllers and services with collaborators stubbed; repositories with the Mongoose model stubbed (for example `Report.aggregate`, per `verification.md:18`); routes checked by inspecting `router.stack` (for example `tests/routes/v2/account.v2.routes.spec.js:20-60`); validators (Joi and express-validator schemas), middleware, util, HL7 client strategies (`tests/services/hl7/`) | Node (CI and Docker use 24); `yarn install` or `npm install`; no database, no AWS, no `.env` expected (inferred: production config is stubbed via proxyquire or env mutation, see Environment Requirements) | PR pipeline `EL-*`, parallel step "Unit Tests (Flaky detection)" running `yarn test:ci` (`bitbucket-pipelines.yml:26-33`); not run in `lf-*` or `main` branch pipelines | Repository-side: runs on every `EL-*` PR but enforcement is `unknown` (no merge check in the repo; Bitbucket settings not visible). aisdlc policy: mandatory | `unknown` (not run; about 97k lines of specs) | In-test literals, sinon stubs and fake objects. No fixture files, no factories, no shared test helper directory (`git ls-files tests` returns spec files only) | See Flaky / Quarantined Tests |
| integration | mocha + mongodb-memory-server (real in-memory MongoDB) + proxyquire | Same `npm test` (no separate command) | Narrow: 8 model specs (`tests/models/activity_log`, `bt_measurements`, `patient`, `patient.v2`, `patient_notes`, `report`, `report.v2`, `user`) and `tests/repository/token.v2.repository.spec.js`. Written as "characterization baseline" tests ahead of the legacy-model to Mongoose migration (`tests/models/patient.spec.js:9-18`). Only Mongo is real; sibling repositories are stubbed. No other store (S3, SQS, SNS, Twilio) is integrated | `mongodb-memory-server` starts a `mongod`; the binary is normally downloaded on first use (inferred from library behavior; no `MONGOMS_*` setting or cached binary is configured in tracked files). Host and architecture compatibility in the CI image is `unknown` | Same unit step | Same as unit | `unknown`; each file sets `this.timeout(60000)` | Collections are emptied in `beforeEach` (`deleteMany({})`); data inserted inline with `ObjectId` | `unknown` (not run). `after` hooks close the client and `mongod.stop()`, so hangs are unlikely if hooks run (inferred) |
| contract | not present | none | Checked: no `pact`, `openapi`, `swagger`, `postman` or schema-registry files tracked (`git ls-files`, `git grep` on `package.json`/`tests`). Validator specs assert Joi schemas at unit level but are not consumer/provider contract tests. Payload shapes sent to SQS/SNS/Lambda/CardioOne/Clinii are asserted only via stubs in unit tests | n/a | none | No | n/a | n/a | n/a |
| API | not present (in the tracked repo) | none | Checked: `supertest` is not in `package.json`; `app.js` has no `module.exports` and calls `connectDb()`/`mongoConnect()` and `app.listen()` as soon as it is required (`app.js:48-53`), so tests cannot import the app. Confirmed by `docs/AMENDMENTS.md:11` and `verification.md:24`. No test sends an HTTP request through Express, `authorize()`, the Joi validators, controllers and services together. Lead only: an untracked local `e2e/` harness (supertest + in-memory Mongo) exists in the working directory; it is not in the analyzed commit | n/a | none | No | n/a | n/a | n/a |
| component | not present | none | Checked: no spec composes route + controller + service with only the DB boundary stubbed. Closest are controller specs with stubbed services and repository specs with stubbed models, i.e. unit level | n/a | none | No | n/a | n/a | n/a |
| end-to-end | not present | none | Checked: no browser or HTTP driver in `package.json`; no spec boots the app. The one documented attempt at feature `0001` accepted repository-level evidence as "the practical ceiling" (`verification.md:24`, `docs/AMENDMENTS.md:10-12`) | n/a | none | No | n/a | n/a | n/a |
| data-quality | not present | none | Checked: no data validation, reconciliation or seed-verification specs. `database/seed/*.seed.js` are seed scripts (write to the configured database) with no tests | n/a | none | No | n/a | n/a | n/a |
| migration | not present | none | Checked: no migration framework (`migrate-mongo` etc. absent from `package.json`), no `migrations/` directory, no migration specs. The word "migration" in `tests/models/*.spec.js` refers to the code migration from native-driver models to Mongoose v2 models, not a data migration. Only seed scripts exist (`package.json:54-55`) | n/a | none | No | n/a | n/a | n/a |
| performance | not present | none | Checked: no `autocannon`, `k6`, `artillery` or benchmark files tracked (`git grep` on `package.json`). The word "benchmark" in code refers to a billing-benchmark feature | n/a | none | No | n/a | n/a | n/a |
| security | not present as a dedicated layer or scan | none | Unit-level security-related specs exist: `tests/middleware/inputSanitizer.spec.js`, `tests/util/v2/inputSanitizer.v2.util.spec.js`, `tests/middleware/rateLimiter.spec.js`, `tests/controllers/v2/mfa.v2.controller.spec.js`. Checked: no SAST, dependency audit (`yarn audit`), secret scan or DAST in `bitbucket-pipelines.yml`; `csp.v2.service` and `middleware/csp.js` coverage is thin (no spec references `csp.v2.service`). SonarQube/SonarCloud may run outside the repo (see CI Integration) | n/a | none in repo | No | n/a | n/a | n/a |
| smoke | not present | none | Checked: `GET /health-check` returns `OK` unconditionally (`routes/index.js:69-71`) but no spec references it and no pipeline step calls it after deploy | n/a | none | No | n/a | n/a | n/a |

## Commands

Observed in `package.json:48-62` and `README.md` ("Tests" section):

| Purpose | Command | Notes |
|---|---|---|
| All tests | `npm test` = `mocha 'tests/**/*.spec.js'` | The glob is single-quoted in the script string. On POSIX `sh` (CI, Git Bash) the quotes are removed and Mocha expands the glob itself, so `**` recurses (an unquoted `**` without `globstar` would match one level only). Under Windows `cmd.exe`, single quotes are literal; whether npm there passes a literal-quoted pattern that matches nothing is `unknown` (inferred risk, not verified; on this machine the shell npm uses is `unknown`) |
| CI variant | `yarn test:ci` = `PROPERTIES=bbc.summary.test-framework:MOCHA mocha 'tests/**/*.spec.js' --reporter mocha-junit-reporter --reporter-options mochaFile=test-results/junit.xml` | The `VAR=value cmd` prefix is POSIX-only; fails under `cmd.exe` (inferred). `PROPERTIES=...` is a Bitbucket test-summary hint. Pipeline runs `mkdir -p test-results` first (`bitbucket-pipelines.yml:30`) |
| One file | `npm run test:file -- tests/<path>.spec.js` (script is bare `mocha`, `package.json:53`) | With no argument Mocha defaults to `./test`, which does not exist, so a path is required (inferred from Mocha defaults) |
| Watch | `npm run test:watch` (`nodemon --exec "npm test"`) | |
| Coverage | `npm run coverage` = `nyc npm run test` | Applies `.nycrc.json`, including the 80% gate |
| Lint | `npm run lint` = `eslint . --max-warnings 0`; `npm run lint:fix` | Any warning fails lint. `no-unused-vars` and `no-console` (except `warn`/`error`) are warnings (`eslint.config.js:50-60`); `eqeqeq`, `no-undef`, `no-prototype-builtins`, `array-callback-return` are errors. `tests/` is linted too (Mocha globals enabled) |
| Format | `npm run format` = `prettier --write .` | Not enforced in CI (no `prettier --check`); applied to staged files by the pre-commit hook |
| Pre-commit | `.husky/pre-commit` runs `npx lint-staged` (`.husky/pre-commit:1`); `package.json:63-71` runs `eslint --fix` + `prettier --write` on staged `*.js` and `prettier --write` on staged json/md/yml | Rewrites staged files at commit time. Installed by `"prepare": "husky"`; the Dockerfile sets `HUSKY=0`. No `commit-msg` or `pre-push` hook is tracked |

## Test Data

Observed: inline literals, hand-built objects and sinon stubs. No JSON/CSV/HL7/PDF fixture files are tracked under `tests/` (all 367 tracked files are `*.spec.js`). 55 spec files use the real clock (`new Date()`, `Date.now()`, `moment()`); only 2 freeze time (`sinon.useFakeTimers` in `tests/services/v2/rpm.v2.service.spec.js:1034` and `tests/util/v2/date_validator.v2.util.spec.js:82,134`). The in-memory-Mongo specs insert documents directly with the native driver and `deleteMany({})` between tests. Seed scripts under `database/seed/` are not test data and write to a real database if run. The `wearlinq sample data/` directory mentioned locally is untracked and was not opened.

## Fixtures and Mocks

Observed patterns:

- `sinon.createSandbox()` created in `beforeEach` and `sandbox.restore()` in `afterEach` (for example `tests/routes/v2/account.v2.routes.spec.js:5-12`).
- `proxyquire` to swap module-level dependencies such as `../util/database`, repositories and utilities (`tests/models/patient.spec.js:42-52`); some specs raise `this.timeout(10000)` because proxyquire reloads heavy modules (`tests/controllers/v2/letter_template.v2.controller.spec.js:48`).
- Controllers: stub the service and assert on `res.status/json` and `next(err)`. Repositories: stub the Mongoose model method (for example `Report.aggregate`) and assert on the argument. Services: stub repositories and external clients (Twilio, S3, SQS, SNS, Cognito, CardioOne, Clinii).
- `tests/util/config.spec.js` replaces `process.env` wholesale and deletes `require.cache` for `util/config` between tests (`config.spec.js:5-16`); 2 files touch `require.cache` in total.
- Project convention (documented, observed in `docs/context/CONSTITUTION.md:79-82`): tests must not hit a real database or third-party API; use `mongodb-memory-server` and `aws-sdk-mock` only where the suite already does.

## Environment Requirements

- Node 24 is the only runtime version evidenced (`bitbucket-pipelines.yml:1` `image: node:24`, `Dockerfile` `node:24-slim`). Package manager: `yarn.lock` is tracked and used by CI and Docker; `README.md` says `npm install`; no `package-lock.json` is tracked (gitignored per `overview.md`).
- Environment variables for tests: no `.env`, setup file or `dotenv` loader is tracked for tests. `util/config.js` reads `process.env.*` at require time (about 40 names, listed in `build-release.md`). Whether any spec transitively requires modules that read AWS Secrets Manager or connect to Mongo on import is `unknown`; checked only that `app.js` is not required by tests and that the three specs calling `mongoose.connect` (`tests/models/bt_measurements.spec.js`, `tests/models/patient_notes.spec.js`, `tests/repository/token.v2.repository.spec.js`) connect to the in-memory server URI.
- Safety note: the local `.env` points at real UAT resources (stated by the task brief). A test run on a developer machine that loads `.env` through `dotenv` (for example via a spec that requires `app.js` indirectly) could contact them. Run tests with a throwaway environment; never with the real `.env` loaded.
- Chromium/Puppeteer: 4 spec files reference `puppeteer`; whether they stub it fully is `unknown`. The PR pipeline's `yarn install` does not set `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` (only the Dockerfile does), so CI likely downloads a browser (inferred).

## Database / Infrastructure Requirements

No external service is required by design: unit tests stub Mongo, AWS and third parties. The 9 in-memory-Mongo specs need the ability to start a `mongod` process (binary download on first run, local disk, a free port) (inferred). No replica set is used (`MongoMemoryReplSet` not found), so MongoDB transaction paths (`database/index.js` `runTransaction` per `docs/context/CONSTITUTION.md`) are not covered by a real-transaction test (unverified). No Docker Compose, test containers or LocalStack are tracked.

## Coverage

- Configured (`.nycrc.json:1-18`): `check-coverage: true` with `lines`, `functions`, `branches`, `statements` all 80. `include`: `util`, `repository`, `services`, `controllers`, `validators`, `routes`, `middleware`. `exclude`: `tests`, `node_modules`, `models`. Reporters: `text`, `html`, `lcov`. `all` is not set, so (nyc default, inferred) only files actually loaded by tests count toward the percentages; wholly untested files do not lower the figure. Output dirs `coverage/` and `.nyc_output` are gitignored.
- Measured: `unknown` (not run). The 80% gate is only reachable through `npm run coverage`; it is not part of any pipeline step, and `test:ci` does not use `nyc`.
- Sonar: `sonar-project.properties` sets `sonar.projectKey`, `sonar.sources=.` and exclusions, but no `sonar.javascript.lcov.reportPaths`, so coverage is not imported through this file. Of the listed exclusion paths, `models`, `schemas`, `events`, `logger`, `helpers`, `database`, `common`, `routes/index.js` and `app.js` exist; `db.update.js`, `db.fields.update.js`, `hl7jobs.update.js`, `nextBillDate.update.js` (and a `build` directory) do not exist in the tracked tree (stale entries). Notably `database/`, `events/` and `helpers/` are excluded from analysis.
- Structural gaps, observed by name search (a source file is "unreferenced" if no spec text mentions its name): no spec references `services/v2/zoom.v2.service.js`, `csp.v2.service.js`, `billing_rules.v2.service.js`, `pdf_extraction.v2.service.js`, `quick_text_template.v2.service.js`, `util/v2/pdfExtraction/pdfTextExtraction.v2.util.js`, `hl7_job.v2.util.js`, `formatter.v2.util.js`, `hospitalAccess.v2.util.js`, `patientConnectivityReportGenerator.js`; none touch `app.js` or `database/index.js`. Indirect coverage through other specs is possible and unmeasured. `schemas/` (13 files) and `common/` (9) have no specs.

## CI Integration

Observed in `bitbucket-pipelines.yml`:

- Pull requests (`pipelines.pull-requests."EL-*"`, lines 9-33), image `node:24`: step 1 "Creating the Node Modules" runs `yarn install` (not `--frozen-lockfile`; `caches: node`; artifact `node_modules/**`); step 2 runs in parallel "Linting (ESLint)" = `yarn lint` and "Unit Tests (Flaky detection)" = `mkdir -p test-results` + `yarn test:ci` with artifact `test-results/**`.
- The pattern `"EL-*"` filters on the PR source branch name. By Bitbucket glob rules (platform behavior, inferred, not documented in the repo) it matches `EL-5476`, `EL-5476-uat` and similar, but not a source branch such as `lf-uat` (the release PR into `main`), `lf-develop` or a hotfix branch not starting with `EL-`; those PRs get no lint or test run (inferred).
- Branch pipelines (`lf-develop`, `lf-qa`, `lf-uat`, `main`) only build, push and deploy; they run no lint, tests, coverage or scan. There is no `default`, `tags` or `custom` section.
- No Sonar, SAST, `yarn audit`, Prettier check or `nyc` step exists in the pipeline. Where Sonar analysis runs, if anywhere, is `unknown`.
- Whether Bitbucket branch restrictions require these checks to pass before merging is `unknown` (settings not in the repo). Merge is human-controlled.

## Required Pre-merge Checks

Observed (what the repo itself runs): on `EL-*` PRs, `yarn lint` (zero warnings) and `yarn test:ci` must succeed for the pipeline to be green; locally the Husky hook applies `eslint --fix` and `prettier --write` to staged files.

Policy guidance for aisdlc (not observed practice): before opening a PR run `npm run lint`, `npm test` and, for changed `util/`, `repository/`, `services/`, `controllers/`, `validators/`, `routes/` or `middleware/` code, `npm run coverage` to confirm the 80% nyc gate (it is not enforced by CI, so a failure there is local evidence only). Confirm the PR source branch is named `EL-<n>` (aisdlc ticket branch rule satisfies this) so the PR pipeline triggers. For release PRs from `lf-uat` to `main` no automated check runs, so the full local run is the only evidence.

## Regression Strategy

Observed convention (`docs/context/CONSTITUTION.md:104-110`, `verification.md`): mirror the source path under `tests/`, extend the existing spec for the touched module, mock at the DB-driver or external-client boundary and assert on arguments/content rather than bare "was called". Feature `0001` (archived-reports transmission-type filter) is the recorded example: pure-function tests on `util/v2/archiveReportFilter.js`, a repository test that stubs only `Report.aggregate` and asserts the pipeline's `$match.$and`, and a recorded decision to accept repository-level evidence in place of an HTTP-level check (`docs/AMENDMENTS.md:10-12`).

Policy guidance (not observed practice): for a bug, add a failing spec in the mirrored test file first; use `tests/models`-style in-memory-Mongo tests when the defect depends on real query or update semantics (stubbed `aggregate` tests cannot catch filter-semantics errors, per `verification.md:35`); where no automated layer can reach the defect (HTTP wiring, auth, Puppeteer/PDF output, HL7 parsing against real messages), record a waiver with manual evidence.

## Flaky / Quarantined Tests

No quarantine mechanism: no `.skip`, `.only`, `retries` or flaky list in the tracked tree. The PR step is named "Flaky detection" and writes JUnit, meaning Bitbucket's flaky-test detection is the intended mechanism, but its results are not visible from the repo (`unknown`).

Static risk indicators (unverified, none observed failing): 55 spec files depend on the real clock while only 2 freeze it, so date-boundary and timezone cases can flip (this code base uses `moment`/`moment-timezone` heavily); 7 files use `setTimeout`; `process.env` and `require.cache` mutation in `tests/util/config.spec.js`; Mocha without `--exit` plus connection-opening specs; a first-run `mongod` download in the integration specs; `proxyquire` module reloads needing extended timeouts. Whether the suite currently passes at the analyzed commit is `unknown`.

## Known Gaps

- No API/HTTP, component, end-to-end, contract, smoke, performance, security-scan, data-quality or migration layers; `app.js` cannot be imported by a test (starts server and DB connection on require) and `supertest` is not installed.
- Tests are heavily mock-based; only 9 files use a real (in-memory) Mongo and none use a replica set or exercise transactions.
- Validation pipeline gaps: no coverage gate, security scan, Sonar step, Prettier check or tests on `lf-*`/`main` branch pipelines or the `lf-uat` to `main` PR; no post-deploy smoke test.
- Coverage is unmeasured and may be overstated by nyc's default of counting only loaded files (inferred). A set of services and utilities has no spec referencing it (see Coverage).
- `sonar-project.properties` has 4 stale path exclusions and no coverage import; `.env.example` lists 18 names whereas `util/config.js` and other code read about 40; `MONGO_DB_HOST`, `SG_MAIL_TOKEN`, `SG_MAIL_SENDER_EMAIL` have no `process.env` reader in tracked non-test code (static grep, so they may be legacy).
- Script portability: `npm test` quoting and `test:ci` env prefix are POSIX-oriented; behavior under Windows `cmd.exe` is unverified.
- `aws-sdk-mock` is in use while production code uses AWS SDK v3 clients; whether those 7 specs still intercept the real calls is `unknown`.

## Feature Test Decision Rules

Policy guidance for aisdlc (derived from the observed structure above; not observed practice):

1. New or changed logic in `services/`, `repository/`, `util/`, `controllers/`, `validators/`, `middleware/` or `routes/`: add or extend a mocha spec at the mirrored path under `tests/`, with sinon/proxyquire stubs for DB and external clients. Use fake timers for date logic.
2. Query-building or aggregation changes (filters, pipelines, `$set` updates): include assertions on the exact filter or pipeline content; add an in-memory-Mongo test (pattern in `tests/repository/token.v2.repository.spec.js`) when the semantics depend on real Mongo behavior.
3. New route: add the route-stack assertions (path, method, middleware present) in the mirrored `tests/routes/` spec and a controller spec; role access changes need `authorize()` assertions.
4. Cross-service payloads (SQS, SNS, Lambda, CardioOne, Clinii, HL7): assert the sent payload shape in the unit spec and record manual or cross-repo evidence, since no contract layer exists.
5. HTTP-level, PDF/Puppeteer, HL7-file, upload or auth-wiring behavior has no automated layer here: record a waiver with manual evidence, or promote creating an API harness (needs `app.js` to export the app without starting the server) as a separate task.
6. Required evidence before merge: `npm run lint` (zero warnings), `npm test` green, `npm run coverage` gate for touched areas, PR source branch `EL-<n>`. Never run tests with the real `.env` loaded; use a throwaway environment.
7. Any mandatory layer that cannot run needs a recorded waiver with reason.
