---
repository: rest-api-evoke
analyzed_commit: 84768b56f78a3663d6cfb9acf128556c4cdab89f
analyzed_at: 2026-10-15T08:40:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [util/v2/userStatus.v2.util.js, routes/v2/account_document.v2.routes.js, controllers/v2/account_document.v2.controller.js, services/v2/account_document.v2.service.js, util/v2/account_document.v2.util.js, validators/v2/account_document.v2.validator.js, common/account_document.js, services/v2/cognito.v2.service.js, controllers/admin.js, app.js, routes/index.js, routes/auth.js, routes/bodyTrace.js, routes/v2/mfa.v2.routes.js, routes/v2/twilio.v2.routes.js, routes/v2/zoom.v2.routes.js, routes/v2/clinii.v2.routes.js, routes/v2/csp.v2.routes.js, routes/v2/cognito.v2.routes.js, middleware/authorize.js, middleware/authorizeService.js, middleware/v2/authorizeEnv.js, middleware/authorizeCognitoClient.js, middleware/cors.js, middleware/csp.js, middleware/rateLimiter.js, middleware/schemaValidator.js, controllers/auth.js, controllers/v2/mfa.v2.controller.js, services/v2/otp.v2.service.js, services/v2/user.v2.service.js, services/v2/zoom.v2.service.js, services/rpm/clinii/clinii.service.js, util/config.js, util/common.util.js, util/v2/token.v2.util.js, util/v2/password.util.js, util/v2/secret_manager/*.js, util/v2/s3.v2.util.js, helpers/role.js, common/userRoleConstant.js, Dockerfile]
---

# Security baseline (Phase I)

Refreshed at `84768b5` (EL-5580 user-status checks, EL-5597 account documents; sections not named in this refresh were not re-verified and carry the prior analysis from `4178ce4`). Names only; no secret value was read or recorded. `.env` was not opened. A read of `.env.example` was blocked by the environment and not retried, so the example's contents are `unknown`; env names below come from `util/config.js`. Everything is observed in code unless marked inferred; nothing was executed.

## Authentication

- Login: `POST /login` (rate limited, `routes/auth.js:11`) checks email, `locked`, `active`, then bcrypt (`bcryptjs`) or Cognito credentials for `idp_user` accounts (`controllers/auth.js:31-79`). 10 failed attempts lock the account (`:64`); the failed response includes `attempts` and `locked` (`:71-78`). Locked and deactivated accounts get distinct messages, which allows account-state enumeration after a correct-or-incorrect email (`:44-55`).
- Session token: JWT signed with `JWT_SECRET` from Secrets Manager, claims `name`, `email`, `userId`, `role`, `accounts`, `loginBy`, optional `provider`; expiry from the user's `session_expiry_duration` or `JWT_EXPIRATION_TIME` (`util/v2/token.v2.util.js:80-110`). Each token is also stored in the `tokens` collection and required on every request (`middleware/authorize.js`); logout deletes it (`controllers/auth.js:logout`). Token delivered in JSON and as cookie `token` (httpOnly; `secure` and `sameSite=None` unless `config.isDevelopment`; 1 day) (`util/common.util.js:327-337`). `authorize` reads the cookie first, then the `Authorization` header.
- The JWT `role` and `accounts` claims, not the DB user, drive authorization (`middleware/authorize.js`, `req.user = {...userDoc, role, accounts, ...}` with role and accounts taken from the token); a role change takes effect only after re-login or token deletion (inferred).
- User status (EL-5580, `851263916`, `216a628fe`): `authorize` loads the user on every request and, when `isUserBlocked` (`active === false` or `locked === true`; strict, so legacy docs without the fields pass; `util/v2/userStatus.v2.util.js`), deletes the session token and returns 401 with `data.code` `ACCOUNT_DEACTIVATED` or `ACCOUNT_LOCKED`. When the token is no longer in `tokens` (revoked), `generateRevokedSessionError` verifies the JWT signature with `ignoreExpiration`, looks the user up and returns the same coded 401 if the user is blocked, otherwise a plain 401. Admin deactivation deletes all of the user's tokens (`controllers/admin.js:683`). OTP login (`validate-login`) refuses blocked users with 403 (`controllers/v2/mfa.v2.controller.js:106`); OTP resend for a known blocked email returns 403 with the message (`:190`); token-based OTP requests return 401 for blocked users (`:181`); Cognito sign-in refuses blocked users with 403 before the upsert (`services/v2/cognito.v2.service.js:94`); forgot-password returns the generic message for deactivated users, and reset/change-password throw 403 for them (`services/v2/user.v2.service.js:54-56,82,154,192`); a further blocked check at `:675` (SSO profile). Password `POST /login` (`controllers/auth.js`) was not changed and still returns distinct 401 messages for locked and deactivated.
- `loginBy` and `provider` claims are copied from the request body (`services/v2/auth.v2.service.js:10-22`), i.e. client-chosen.
- Password reset: `POST /v2/user/forgot-password` returns a generic message; a 5-minute JWT, AES-wrapped with `CRYPTO_SECRET`, is emailed and mirrored in `temporary_tokens` (TTL 300s) (`services/v2/user.v2.service.js:59-105`). `PUT /v2/user/reset-password` verifies it, bcrypt cost 12, deletes the user's tokens (`:165-215`). No rate limiter is applied to either route (`routes/v2/user.v2.routes.js:27,35`).
- MFA/OTP: 6-digit TOTP-derived code emailed, stored bcrypt-hashed, 5-minute life, 10 requests and 5 validation attempts per OTP window (`util/constants.js:191-200`, `services/v2/otp.v2.service.js`). Rate limiters per route (`middleware/rateLimiter.js`). `OTP_REQUEST` resets the validate limiter key for the IP after a successful send (`controllers/v2/mfa.v2.controller.js:~186`).
- Cognito: browser OIDC login (`/oauth/cognito`, `/cognito/verify`), provider `evoke` and federated `rhythm`; ID tokens verified with RS256, issuer and audience (`util/v2/cognito.v2.util.js:412-440`). The generated `state` and `nonce` are put in the authorization URL (`:599-608`); I did not find them stored or checked server-side in the portion read (not fully traced; `unknown`). M2M access for `GET /v2/user/...users/read` uses `authorizeCognitoClient` + `authorizeCognitoScope(["users/read"])` (RS256 verified, issuer, `token_use`, client list) (`middleware/authorizeCognitoClient.js`, `routes/v2/user.v2.routes.js:21-22`).
- Service identity: `authorizeService.validateToken` accepts any JWT signed with `JWT_SECRET`, then loads the user named by `EVOKE_AUTOMATED_NOTES_USER` (default "EVOKE AUTOMATED NOTES") (`middleware/authorizeService.js:10-33`). Used by `/v2/service` (routes/v2/service.v2.routes.js not read in detail).

## Authorization

- Roles (8): `admin`, `assistant`, `user`, `clinic`, `clinicReviewer`, `physician`, `clinicAdmin`, `rpmUser` (`helpers/role.js`; duplicate `Role` in `util/constants.js:9-18`; groups `EVOKE_ROLES` = user/admin/assistant, `CLINIC_ROLES` = clinic/clinicReviewer/physician/clinicAdmin, `USER_ROLES`).
- Per route: `authorize(roles, key)` (`middleware/authorize.js`). Empty `roles` means any authenticated user (`:113`, `roles.length &&`). Optional `key` like `manual_upload.report_upload` lets an account's `role_preferences[feature][field]` replace the role list when the request has an `account` header (`:96-111`), mapped through `MAP_PREFERENCE_USER_ROLES` (admin, user, assistant, physician, clinic, clinicAdmin; no clinicReviewer or rpmUser, `common/userRoleConstant.js`).
- Account documents (`/v2/account-documents`, EL-5597, mounted at `routes/index.js:135`): all three routes use `authorize(EVOKE_ROLES)` (user, admin, assistant; clinic roles excluded) and the service additionally requires the account name to be in the caller's JWT `accounts` claim (`checkHasAccessToAccount`, `services/v2/account_document.v2.service.js:21-31`, `util/v2/access.v2.util.js:14`; no admin bypass seen). `GET /:accountId/:documentType` streams the PDF inline with a fixed server-chosen file name; `GET /:accountId` returns availability flags; `PUT /:accountId?documentType=` uploads. The two GET routes do not apply the Joi `params` schema (defined in `validators/v2/account_document.v2.validator.js` but not wired for GET; `documentType` is checked with `Object.hasOwn` in the service; `accountId` is not format-checked on GET) (observed in the routes file).
- Data-level scoping is in services (`user.accounts` / `user.manufacturer` filters, `generateNoAccessError`, e.g. `services/v2/patient.v2.service.js:1405`); hospital scoping for physicians with `isFollowingHospital` only for the review queue (`util/v2/hospitalAccess.v2.util.js`). Consistency across all controllers was not audited.
- `authorizeEnv(["local", ...])` blocks routes by `config.env` (`middleware/v2/authorizeEnv.js`).

## Routes mounted or defined without `authorize`

Programmatic scan (run at `4178ce4`; the one new route file, `routes/v2/account_document.v2.routes.js`, was read by hand at `84768b5` and has `authorize` on every route) of every `router|routes.<verb>` call in `routes/` (366 calls; 291 with an auth middleware in the argument list; `routes/index.js` `use` lines are mounts only). Verb-level routes without auth:

| Route | Protection found |
|---|---|
| `POST /login` | rate limiter (`routes/auth.js:11`) |
| `GET /oauth/cognito` | none needed (builds URL) |
| `POST /bodytrace/bp`, `POST /bodytrace/weight` | none (`routes/bodyTrace.js`); controller looks up patient by body `imei` and writes measurements (`controllers/bodyTrace.js:5-62`) |
| `GET /health-check` | none (intended) |
| `POST /cognito/verify` | Cognito code/ID-token verification |
| `POST /csp/report` | none; writes to S3 and `csp_violations` (`services/v2/csp.v2.service.js`) |
| `POST /v2/mfa/otp/validate-login` | rate limiter; body `{email, otp}`; on success issues a session token without a password check (`controllers/v2/mfa.v2.controller.js:80-135`) |
| `PUT /v2/mfa/otp/request` | rate limiter; body `{email}` triggers an OTP email |
| `POST /v2/user/forgot-password`, `PUT /v2/user/reset-password` | Joi validation only; reset needs the emailed token |
| `POST /v2/patient/update-document` | PostGrid webhook: body is a JWT verified with `WEBHOOK_SECRET` (`controllers/v2/patient.v2.controller.js:1005-1010`) |
| `POST /v2/twilio/sms-reply`, `/callback`, `/error` | none found: no Twilio signature validation in controller/service (grep for signature/validateRequest returned nothing) |
| `POST /v2/zoom/webhook` | HMAC signature verified except when `config.isDevelopment` (`services/v2/zoom.v2.service.js:~185-215`) |
| `POST /v2/rpm/clinii/webhook-process` | header `code` compared to `CLINII_ACCESS_CODE` with `!==` (`services/rpm/clinii/clinii.service.js:~347`); mismatch returns a message, not an HTTP error |

`GET /accounts` and other account routes do use `authorize` (`routes/v2/account.v2.routes.js`). The mount comment "// public routes" in `routes/index.js:66` is misleading; auth is per route, so any new route is public by default.

## Transport and headers

- CORS (`middleware/cors.js`): allow-list from `ALLOWED_ORIGINS` (startup throws if unset), requests without an `Origin` header allowed, `credentials: true`, explicit methods and headers. Applied globally and for `OPTIONS *` (`app.js:26-27`).
- CSP/helmet: `middleware/csp.js` exists (helmet, CSP, HSTS) but is commented out in `app.js:8,23`; no other helmet use found in `app.js`. This is an API; the CSP content targets a front end, so benefit is `unknown`. `POST /csp/report` collects reports from clients.
- `app.set("trust proxy", 1)` (`app.js:24`): `req.ip` and rate-limit keys trust one proxy hop.
- Rate limiting (`middleware/rateLimiter.js`): `apiRateLimiter` (10 per 15 min, counts failures only) on `/login`; OTP limiters (5 per 5 min, request limiter 10). In-memory store (default `express-rate-limit`): per process, not shared across replicas (inferred; no store configured). No global limiter.
- `express.json()` has no explicit size limit (`app.js:29`, default 100kb).

## Validation and sanitization

- Joi (`@hapi/joi`) via `util/v2/validate.v2.util.js`; converted values are discarded, raw `req.body` continues to controllers. Legacy `express-validator` and `middleware/schemaValidator.js` (never blocks) remain.
- `middleware/inputSanitizer.js` (`sanitizeInput` on body/query/params) is commented out in `app.js:11,30`; whether services sanitize individually is `unknown` (an `escapeHTML` util exists in `util/v2/escapeHTML.js`).
- Raw regex built from user input is used in searches (`services/v2/patient.v2.service.js:2125` `$regex: value`), no escaping seen at that line (possible ReDoS / over-match; exploitability unknown).

## Secrets and configuration (names only)

- Secrets Manager secret ARN from env `AWS_SECRET_ARN`, region `AWS_REGION`; bot secret ARN `AWS_BOT_SECRET_ARN` (`util/config.js`). Cached in process memory for the process lifetime (`util/v2/secret_manager/secretValue.js`).
- Secret keys read (names): `DB_URI`, `JWT_SECRET`, `JWT_EXPIRATION_TIME`, `CRYPTO_SECRET`, `BOT_SECRET_KEY` (comma-separated pair: AES key and JWT key), `CLIENT_URL`, `WEBHOOK_SECRET`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_OPT_OUT_SLACK_WEBHOOK_URL`, `POST_GRID_BASE_API`, `POST_GRID_PRINT_MAIL_API_KEY`, `POST_GRID_ADDRESS_VERIFICATION_API_KEY`, `POST_GRID_SENDER_CONTACT_ID`, `ZOOM_WEBHOOK_SECRET_TOKEN`, `ZOOM_ENABLE_CALL_LOGGING`, `CLINII_BASE_URL`, `CLINII_CLIENT_ID`, `CLINII_ACCESS_CODE`, `API_BASE_URL_BENCHMARK`, `API_USERNAME_BENCHMARK`, `API_PASSWORD_BENCHMARK`, `EHR_SLACK_WEBHOOK_URL`, `MERGE_PATIENT_SLACK_WEBHOOK_URL`, `PATIENT_NOTE_DELETE_REQUEST_SLACK_WEBHOOK_URL`, Cognito: `AWS_COGNITO_USER_POOL_ID`, `AWS_COGNITO_CLIENT_ID`, `AWS_COGNITO_ISSUER`, `AWS_COGNITO_CLIENT_SECRET`, `AWS_COGNITO_REDIRECT_URI`, `AWS_COGNITO_M2M_RHYTHM_CLIENT_ID`, `SSO_RHYTHM_*` (issuer, client id, redirect/logout/error URIs, API/auth base URLs, auth client id and secret).
- Env names with credential-like content in `util/config.js`: `AWS_SES_ACCESS_KEY`, `AWS_SES_SECRET_KEY` (static SES keys), `JWT_SECRET` and `CRYPTO_SECRET` (also present as env fallbacks in `config.jwt`/`config.crypto`; whether they are used is not traced), `POST_GRID_PRINT_MAIL_API_KEY`, `POST_GRID_ADDRESS_VERIFICATION_API_KEY`, `WEBHOOK_SECRET`. Other env names: `APP_PORT`, `APP_ENVIRONMENT`, `NODE_ENV`, `CLIENT_URL`, `ALLOWED_ORIGINS`, `MONGO_DB_TIME_OUT`, `EVOKE_AUTOMATED_NOTES_USER`, queue/topic/Lambda names, `CSP_REPORT_URI`, `CSP_REPORT_ONLY`, `AWS_LAMBDA_REGION`, `AWS_LAMBDA_FUNCTION_NAME_BOT`.
- Hardcoded secrets: none seen in files read; a repo-wide secret scan was not run (`unknown`).
- `NODE_ENV` is not set in the `Dockerfile`; `config.env` defaults to `"local"` (`util/config.js:6`) and `isDevelopment` drives cookie `secure`/`sameSite`, Zoom signature bypass and Cognito redirect choice. Pipelines/manifests that set `NODE_ENV` are outside this repo (`unknown`).

## Cryptography

- Passwords: bcrypt (cost 12 reset, `user.v2.service.js:179`). OTP: bcrypt cost 10.
- Session/reset token wrapper: `crypto-js` AES (passphrase mode) over the JWT string, base64 (`util/v2/token.v2.util.js:20-40`).
- Manufacturer portal credentials are reversibly stored: AES-CBC with random IV (`util/v2/token.v2.util.js:52-62`) then JWT-signed (`util/v2/password.util.js`); anyone holding `BOT_SECRET_KEY` can recover them.
- `new Buffer(...)` (deprecated) in `secretValue.js`. Signature compares use `===` (Zoom, Clinii) rather than constant-time comparison.

## PHI in logs and external channels

- Logger messages include IDs and error messages; request bodies are not logged by `morgan` format (depends on `APP_ENVIRONMENT`, `unknown`). `user_activity_logs` persist request payloads and IPs (`models/v2/user_activity_logger.js`), possibly PHI.
- Slack webhooks receive operational text: HL7 job failures with report id and error, merge-patient alerts that include Evoke ids and error text (`services/v2/patient.v2.service.js:3595-3609`), note deletion requests, Twilio opt-outs (message content not reviewed). Whether Slack is approved for PHI is `unknown`.
- Twilio SMS/voicemail and PostGrid letters carry patient content and are stored in `twilio_logs`/`post_grid_logs`.

## File uploads

- multer has no `limits` except the new account-document uploader (memory storage, `fileSize` 5 MiB, `files: 1`; `common/account_document.js`, `routes/v2/account_document.v2.routes.js:14-17`). The others (grep at `84768b5`: `routes/v2/account.v2.routes.js:8`, `user.v2.routes.js:13`, `in_office.v2.routes.js:25`, `manual_upload.js:13`, `transmission.v2.routes.js:20`, `util/v2/s3.v2.util.js:85`) have no size cap beyond `upload.array("reports", 10)` and `maxCount: 10`.
- Account-document upload validation: client MIME must be `application/pdf` and the buffer must start with `%PDF-`; the S3 key is built server-side from the account name (lower-cased, whitespace to `-`) and a fixed file name per type, so the client does not choose the key (`services/v2/account_document.v2.service.js:57-92`, `util/v2/account_document.v2.util.js`). Each upload overwrites the previous object for that account and type. S3 failures are logged by account id and type; the client gets generic messages.
- Memory storage (`routes/v2/manual_upload.js`, `routes/v2/in_office.v2.routes.js`) with in-office extension filter only; disk storage into `assets/signature` (`routes/v2/user.v2.routes.js:13`, `routes/v2/account.v2.routes.js:8`) with no file filter; multer-s3 uploaders build S3 keys from request body fields (`manufacturerFolder`, `accountFolder`, `name`) with partial `.replace` sanitization (`routes/v2/transmission.v2.routes.js:20-38`); `createFileUploader` filters by client-supplied MIME type (`util/v2/s3.v2.util.js:85-125`). All upload routes seen are behind `authorize`.
- Downloads use presigned S3 URLs, 3600 s (`util/constants.js:226`, `util/v2/s3.v2.util.js:178`).

## Dependency notes

`package.json` and `yarn.lock` were not re-audited in this phase; `@hapi/joi` (deprecated package name), `express-validator` legacy, Mongoose 6 and native driver 4 are per `overview.md`. No `yarn audit`/SCA step was looked for beyond `overview.md`; CI scanning is `unknown`.

## Findings (follow-ups)

| # | Finding | Evidence | Confidence |
|---|---|---|---|
| 1 | Role override leaks across requests: `roles = rolePreferences.map(...)` assigns to the closure variable shared by all requests to that route, so one request's `account` header can change the allowed roles for later requests. | `middleware/authorize.js:34,106` (`roles` is the factory closure variable, reassigned per request) | high (code), medium (impact) |
| 2 | An account preference that is an empty array makes `roles` empty, which disables the role check (any authenticated user passes). | `middleware/authorize.js:104-113` | medium |
| 3 | Email-OTP login without password: `/v2/mfa/otp/request` and `/validate-login` are public and `validate-login` issues a session from `{email, otp}`; guess budget is limited (5 attempts per OTP, 10 requests per window, per-IP limiter, which is reset by new OTP requests). Since EL-5580 `validate-login` rejects blocked (deactivated/locked) users with 403, but only after `validateOTP`, and the resend path reveals locked/deactivated state for a known email. Possibly intended; needs a design decision. | `controllers/v2/mfa.v2.controller.js:100-115,181-195`, `middleware/rateLimiter.js` | medium |
| 4 | `authorizeService.validateToken` accepts any valid user session JWT as a service token (signature only, no audience/claim check, no token-store check) and then acts as the automated-notes user. When the token is missing it calls `next(error)` without returning, then calls `next` again in the catch. | `middleware/authorizeService.js:14-33` | high |
| 5 | Zoom signature check is skipped when `config.isDevelopment`, and `isDevelopment` is true whenever `NODE_ENV` is unset; the Dockerfile does not set it. Signature built from `JSON.stringify(req.body)` not the raw body, compared with `===`. | `services/v2/zoom.v2.service.js:~185-215`, `util/config.js:6-7`, `Dockerfile` | medium |
| 6 | Twilio webhooks (`/v2/twilio/*`) have no signature validation; they can update logs and opt-out state for any phone number. | `routes/v2/twilio.v2.routes.js`, `controllers/v2/twilio.v2.controller.js` | medium (no validation found in grep) |
| 7 | BodyTrace webhooks have no authentication; anyone knowing a patient device IMEI can write measurements and change last-send/missed-window state. `new Date(body.ts).toISOString()` throws on bad input (unhandled path unknown). | `routes/bodyTrace.js`, `controllers/bodyTrace.js:5-62` | high (no auth), medium (impact) |
| 8 | `getSecretMangerValue` swallows errors and returns `undefined`; callers destructure it (`const { DB_URI } = await ...`), producing TypeErrors that hide the cause. | `util/v2/secret_manager/secretValue.js`, `util/database.js:9` | high |
| 9 | CSP middleware, input sanitizer and global rate limiting are commented out or absent in `app.js`; `/csp/report` is public and unbounded (S3 writes per request). | `app.js:8,11,23,30`, `routes/v2/csp.v2.routes.js` | high |
| 10 | `changePassword` hashes only when `newPassword === confirmPassword`; otherwise `hashedPassword` is `undefined` and still passed to `updatePassword` (depends on Joi preventing this upstream, not verified). | `services/v2/user.v2.service.js:176-185` | medium |
| 11 | Session tokens and reset tokens are stored in clear in `tokens`/`temporary_tokens`; manufacturer credentials are reversible. A DB read compromise yields live sessions. | `models/v2/token.v2.model.js`, `util/v2/password.util.js` | high |
| 12 | Account-state enumeration and lock-out visibility at login (distinct messages for locked/deactivated; `attempts` returned). Lock-out counter updates are not awaited or atomic. EL-5580 adds more distinguishable states (OTP resend 403 message; coded 401 `ACCOUNT_DEACTIVATED`/`ACCOUNT_LOCKED`). | `controllers/auth.js:44-79`, `middleware/authorize.js` | high |
| 13 | multer has no size limits except the account-document uploader; disk uploader writes into the tracked `assets/` tree with no file filter. | `routes/v2/user.v2.routes.js:13`, `routes/v2/account.v2.routes.js:8` | high |
| 14 | `deletePatient` hard-deletes all reports of the patient without archive. Merge transaction may not actually run inside the Mongoose session because it uses the separate native client. | `services/v2/patient.v2.service.js:1413`, `repository/v2/patient.v2.repository.js:1930` | high (delete), low (session) |
| 15 | Clinii webhook returns HTTP 200 with a message on a bad code and compares with `!==`. | `services/rpm/clinii/clinii.service.js:~347-350` | high |
| 16 | The revoked-session lookup verifies the JWT signature but ignores expiry to choose the 401 code, so a holder of an old token can learn the account is deactivated or locked (low impact; a signed token is needed). | `middleware/authorize.js:17-31` | medium |

## Unknowns

- `.env.example` contents; real IAM, network exposure, WAF, ingress rate limiting (outside this repo).
- Whether `/v2/service` and other routes not read in full enforce additional checks; legacy v1 route authorization beyond the scan above.
- Whether Cognito `state`/`nonce` are validated; full `buildError` fall-through behaviour (stack/message exposure for unknown errors).
- Dependency vulnerabilities (no audit run).
