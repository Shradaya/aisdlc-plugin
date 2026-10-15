---
repository: rest-api-evoke
analyzed_commit: 84768b56f78a3663d6cfb9acf128556c4cdab89f
analyzed_at: 2026-10-15T08:40:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [routes/v2/account_document.v2.routes.js, services/v2/account_document.v2.service.js, controllers/v2/account_document.v2.controller.js, common/account_document.js, util/v2/userStatus.v2.util.js, middleware/authorize.js, models/activity_log.js, models/v2/report_cover_page.js, models/v2/clinic_signature_updates.js, .husky/pre-commit, .prettierrc, package.json, app.js, routes/index.js, routes/v2/mfa.v2.routes.js, middleware/errorHandler.js, middleware/schemaValidator.js, util/v2/validate.v2.util.js, util/v2/error.v2.util.js, util/v2/error.js, util/config.js, util/common.util.js, repository/v2/sequencer.v2.repository.js, models/v2/*.js, Dockerfile, overview.md, structure.md]
---

# Conventions (Phase J)

Refreshed at `84768b5`; the lint, prettier, husky and package.json items were re-read from the snapshot and still hold (`.husky/pre-commit` = `npx lint-staged`, `.prettierrc` unchanged). Commit-subject statistics are from the prior run (the snapshot has no git history, so they were not recomputed). Preliminary version written from code read so far. Items marked `unknown` were not yet verified (lint rules, prettier options, husky and lint-staged contents, git log subjects, test layout); a refinement pass should fill them from `eslint.config.js`, `.prettierrc`, `.husky/pre-commit`, `package.json`, `bitbucket-pipelines.yml` and `git log`.

## Layout and naming

- Layers (observed in `structure.md`): `routes/v2/<name>.v2.routes.js` -> `controllers/v2/<name>.v2.controller.js` -> `services/v2/<name>.v2.service.js` -> `repository/v2/<name>.v2.repository.js` -> `models/v2/<name>.v2.model.js`. Helpers in `util/v2/<name>.v2.util.js`, Joi schemas in `validators/v2/`.
- The pattern is not uniform: some files drop the `.v2` suffix (`routes/v2/transmissions.js`, `routes/v2/manual_upload.js`, `repository/v2/manufacturer.repository.js`, `repository/v2/sftp_job.repository.js`, `models/v2/cardio_one_api_log.js`, `models/v2/user_devices.model.js`), mix `kebab`/`snake`/camel (`benchmark-billing.v2.routes.js`, `apiJob.v2.routes.js`, `Report.v2.model.js`), and `/v2` route prefixes use kebab-case (`routes/index.js:78-138`).
- Legacy v1 files sit flat (`routes/*.js`, `controllers/*.js`, `models/*.js`, `schemas/*.js`) and use the raw driver through `util/database.js` `getDb`. Both generations are mounted together (`routes/index.js`). New work belongs in the v2 chain.
- Migration wrapper pattern (EL-5638, `115ae4182`): when a raw-driver model was moved to Mongoose, a new `models/v2/<name>.v2.model.js` holds the schema and the old class file is kept as a thin wrapper that calls it (`models/activity_log.js`, `models/v2/report_cover_page.js`, `models/v2/clinic_signature_updates.js`), so callers did not change. The rest of the raw-driver models (`patient`, `report`, `user`) are not migrated; see `data-model.md`.
- Model exports: Mongoose models are exported as `exports.<Name> = model("<collection>", schema)` or `module.exports = Model`; both styles occur. Collection names are plural snake_case with exceptions (`reportBanner`, `nextSendUpdate_log`, `patient_document`, `patient_medication`, `login_otp`).
- Role names: `helpers/role.js` (camelCase values such as `clinicAdmin`). `util/constants.js` also defines `Role`; the two copies are imported interchangeably by routes.
- Request-field and DB-field casing is mixed (`snake_case` for most DB fields, camelCase in `firstName`, `deviceInformation`, `reportId`).

## Request flow patterns

- Routes declare `authorize([roles], "feature.key")` then (optionally) a rate limiter or multer, then `validate.body|query|params(<Joi schema>)` from `util/v2/validate.v2.util.js`, then the controller (`routes/v2/mfa.v2.routes.js`, `routes/v2/in_office.v2.routes.js`).
- `validate.*` runs `schema.validate(data, {abortEarly:false})` and calls `next(error)` on failure but does not write the converted value back to `req` (`util/v2/validate.v2.util.js`). A legacy variant `middleware/schemaValidator.js` instead sets `req.error` and always calls `next()`, so controllers must check `req.error` (used by 1 route file, per a grep of `require` lines).
- Newest feature as a template (EL-5597 account documents): route file with `authorize(EVOKE_ROLES)`, Joi `validate.*`, multer with explicit `limits`, controller, service (access check, then repository), repository with `.lean()`, constants in `common/account_document.js`, util with pure helpers, Joi schemas in `validators/v2/account_document.v2.validator.js`, one spec per layer under `tests/` (`tests/routes/v2/account_document.v2.routes.spec.js`, etc.). Route paths `/v2/account-documents` use kebab-case; type keys are camelCase (`alertProtocol`, `clinicProtocol`) mapped to snake_case DB fields.
- User status checks go through `util/v2/userStatus.v2.util.js` (`isUserBlocked`, `isUserDeactivated`, `getBlockedUserMessage`, `getBlockedUserCode`) rather than inline `active`/`locked` tests (used by `middleware/authorize.js`, MFA controller, Cognito and user services). Coded 401s pass the code in `ErrorResponse` `data` (`generateUnauthorizedError({code})`, `util/v2/error.js:7`).
- Controllers are `async (req,res,next)` with `try { ... res.json(...) } catch (error) { next(error) }` (`controllers/v2/mfa.v2.controller.js`, `controllers/v2/csp.v2.controller.js`). Some wrap and rethrow as a new `ErrorResponse(error.message, error.statusCode, error.data)` (`controllers/auth.js`, `controllers/v2/mfa.v2.controller.js:updateMFA`).
- Services return `{ type: "Success", message, data }` objects (`services/v2/auth.v2.service.js`, `services/v2/otp.v2.service.js`) and throw `ErrorResponse`; repositories return Mongoose results or `.lean()` objects and hold query logic (aggregations live in `repository/v2/`). Raw `db().collection(...)` calls also appear in repositories (`repository/v2/patient.v2.repository.js:1930-1950`).
- Events: side effects such as activity logging use in-process EventEmitters (`middleware/activityLogger.js`, `middleware/v2/userActivityLogger.js`, `events/`).

## Error handling

- Class `ErrorResponse(message, statusCode, data)` in `util/v2/error.v2.util.js` sets `statusCode`, `status` ("fail" for 4xx else "error"), `isOperational`, `type = "Error"`, `data`.
- `middleware/errorHandler.js` calls `buildError(err)` (`util/v2/error.js`) and responds `res.status(statusCode).json({ type, data, error: true, message })`, then calls `next()` after responding. `buildError` maps Mongo duplicate key (code 11000), "Cast to" errors, Joi `ValidationError`, `JsonWebTokenError`, `TokenExpiredError` to 400/401 messages; the remainder of the function (not read) handles other errors.
- Legacy controllers set `error.statusCode = 422` on plain `Error` and use `.then/.catch` chains (`controllers/bodyTrace.js`).
- Unmatched routes: `app.all("*")` raises `ErrorResponse` 404 (`app.js:37-39`).
- Success responses are not uniform: `{ type, message, data }`, `{ error: false, message }`, or bare results.

## Configuration

- `util/config.js` exports `config` built once from `process.env` (via `dotenv`): `env` defaults to `"local"` when `NODE_ENV` is unset, with `isDevelopment`/`isProduction` flags. Non-secret settings are read here (port, client URL, SES/SQS/SNS/Lambda names, PostGrid, CSP, allowed origins).
- Secrets come from AWS Secrets Manager through `util/v2/secret_manager/secretValue.js` `getSecretMangerValue()` (cached object); callers read keys such as `JWT_SECRET` directly. `process.env` is also used directly in `services/lambda.js:13,23`. Both mechanisms coexist; secret key names are in `security.md`.
- Env var names are collected only in `util/config.js`; `.env.example` content was not read in this pass (a read was blocked by the environment), so completeness versus `.env.example` is `unknown`.

## Logging

- Access logging skips `/health-check` (EL-5639, `app.js:35`).
- winston logger exported from `logger/` (`const { logger } = require("../logger")`), used as `logger.error/warn/info`. HTTP access logging via `morgan(config.app.environment)` (`app.js:32`). A few `console.error` calls exist (`database/index.js:36`). PHI-in-log risks are in `security.md`.

## Git, commits, branches

- Commit message `<ticket>: <summary>` and branch `EL-<n>`: evidenced by the skill list (`esdlc:git-commit` "EL-5543: ...") and overview (`EL-<n>` branches, release tags, `lf-develop|lf-qa|lf-uat|main` promotion). Hooks (`.husky/pre-commit` runs `npx lint-staged`, per `structure.md`) were not re-read here: commit-msg hook and exact lint-staged commands are `unknown`.
- Merges arrive as Bitbucket pull requests (HEAD commit message "Merged in lf-uat (pull request #6135)").

## Lint, format, tests

- Prettier (`.prettierrc`, observed): semicolons, 2-space indent, no tabs, double quotes (`singleQuote: false`), `trailingComma: es5`.
- ESLint (`eslint.config.js`, observed): flat config, `@eslint/js` recommended + `eslint-config-prettier`, `sourceType: script` (CommonJS), node/es2021/mocha globals. Errors: `no-undef`, `no-prototype-builtins`, `eqeqeq` (always), `array-callback-return`. Warnings: `no-unused-vars` (ignores `_`-prefixed), `no-console` (only `console.warn`/`console.error` allowed). `package.json` runs `eslint . --max-warnings 0`, so warnings fail `npm run lint`.
- Pre-commit (`.husky/pre-commit`, observed): `npx lint-staged`; `package.json` `lint-staged` runs `eslint --fix` and `prettier --write` on `**/*.js`, and `prettier --write` on `**/*.{json,md,yml,yaml}`. No `commit-msg` hook or commitlint config is tracked (checked `git ls-files`).
- Commit subjects (observed in `git log -200 --no-merges`): 137 of 200 match `EL-<n>: <summary>`; the rest are branch-suffixed (`EL-5424-uat: ...`), `Hotfix: ...`, or free text, so the convention is customary and not enforced by a hook. Merge commits are `Merged in <branch> (pull request #<n>)`.
- Tests: mocha/chai/sinon under `tests/` mirroring source paths (379 `*.spec.js` files at `84768b5`, up from 367; `npm test` = `mocha 'tests/**/*.spec.js'`); detail in `testing.md`.
- Comments: JSDoc blocks on many controllers/services; a number of commented-out blocks remain (`app.js:8,11,23,30`, `controllers/auth.js:~215`, `util/v2/user.v2.util.js:53-56`).

## Things to follow when changing code

- Add new endpoints in the v2 chain and register in `routes/index.js`; apply `authorize` explicitly, because mounting is flat and there is no default auth (see `security.md`).
- Put queries in `repository/v2/`, business rules in `services/v2/`, and throw `ErrorResponse` with an `API_STATUS_CODE` constant (`common/constant.js`).
- Use `util/v2/secret_manager` for secrets and `util/config.js` for non-secret env settings.
- Keep the Lambda `manufacturer-hl7-parser` in mind before changing shared collection shapes (`data-model.md`).

## Unknowns

- Bitbucket-side enforcement of branch names, PR rules and commit messages (not visible in the repository).
- Whether legacy v1 routes are still called by the front end.
