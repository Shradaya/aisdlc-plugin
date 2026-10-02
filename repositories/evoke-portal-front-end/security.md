---
repository: evoke-portal-front-end
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_branch: main
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/hooks/useAuth.js, src/utils/routes.util.js, src/utils/auth.js, src/hooks/useSessionExpiry.js, src/app/lib/api.js, src/app/store/index.js, nginx.conf, Dockerfile, bitbucket-pipelines.yml, src/schemas]
---

# evoke-portal-front-end: Security baseline (Phase I)

Server-side enforcement is outside this repository (`unknown`). Names only, no secret values.

## Authentication (observed)

- `POST /login`; an empty `data` response means an OTP step, then `POST /v2/mfa/otp/validate-login`. The JWT goes to `localStorage.authToken`; axios sends `Authorization: Bearer` with `withCredentials: true`.
- Cognito: `GET /oauth/cognito` returns a URL, redirect, callback `/auth/cognito`, `POST /cognito/verify`. No AWS SDK or client ids in the SPA.
- Session: JWT `exp` decoded client-side (no signature check, timers only); warning 5 minutes before expiry with `POST /v2/user/refresh-token`; any 401 (except `/login`, `/logout`) triggers expiry handling; forced logout does not call the server.
- Password reset: `/reset-password?token=` (validated by API) and legacy `/reset/:authToken` (token in URL path).

## Authorization (observed)

Client-side only: `ProtectedRoute` checks localStorage values against role lists, which a user can edit in DevTools. `/patient/:patientId` and `/patient/report/:reportId` have no role list. Hard-coded clinic names drive behavior (`/reports-assignment` requires clinic name Centra). `clinicReviewer` is commented out of `CLINIC_ROLES` (`constants.js`).

## PHI and PII (observed)

Patient names, DOB, SSN, MRN, addresses, phones, insurance, clinical notes and PDFs are handled. SSN is masked in display but held in full in state and sent in the profile PUT. Patient search text and file paths go unencoded into GET query strings. Redux devTools is `true` in every build (`src/app/store/index.js:52`). 15 `createObjectURL` vs 1 `revokeObjectURL`. Microphone audio is streamed to the `transcribe` socket.

## XSS and unsafe sinks (observed)

No `dangerouslySetInnerHTML` or `eval` (verified by grep). `LetterTemplatePreview.js` writes API-supplied HTML into an iframe with `sandbox="allow-same-origin"` (no scripts). Zoom `postMessage` checks `event.origin`. Server-supplied redirect URLs are used without an allowlist. 8 `target="_blank"` links, 3 with `rel="noopener"`.

## Files (observed)

Dropzone accept lists by extension; size limit is display-only; downloads via `js-file-download` and blob URLs.

## nginx and CSP (observed)

HSTS, `X-Frame-Options: SAMEORIGIN`, `nosniff`, `server_tokens off`. CSP: `default-src 'self'`; `script-src 'self'` plus the exact unpkg `pdfjs-dist@2.16.105` worker; `style-src` with `'unsafe-inline'`; `connect-src 'self' https://*.emc-portal.com wss://*.emc-portal.com blob:`; `frame-src` self, `evoke.lcwms.co`, Zoom; `frame-ancestors 'self'`; `base-uri 'none'`. No Referrer-Policy or Permissions-Policy. `report-uri` uses a wildcard host (inferred ineffective). Clinii iframe origin (from API) is not obviously in `frame-src` (inferred). Container runs as non-root on port 8080.

## Secrets (observed)

No hard-coded secrets found. `REACT_APP_BASE_URL`, `REACT_APP_SOCKET_SERVER_URL`, `REACT_APP_ENV` are compiled into the public bundle by design. Pipeline variable names: `AWS_REGION`, `AWS_ROLE_ARN`, `FE_ECR_REGISTRY`, `FE_IMAGE`, `MANIFEST_REPO_SSH_KEY`, `REACT_APP_BASE_URL_{DEV,QA,PRE,PROD}`, `REACT_APP_ENV_{DEV,QA,PRE,PROD}`, `REACT_APP_SOCKET_SERVER_{PRE,PROD}_URL`.

## Password policy client-side (observed)

Login min 6; change min 8; reset min 12 with upper, lower, digit, special; admin-created user min 12 with digit and special (no uppercase). Inconsistent.

## Dependencies (observed)

`resolutions` pin `@mui/utils` and `webpack`. `react-scripts` 5.0.1 (CRA deprecated, inferred). Two pdf.js versions. `moment` plus dayjs and date-fns. No audit, SAST or Sonar step in the pipeline.

## Findings for follow-up

1. `authToken` in localStorage. 2. Client-only role gating. 3. PHI in query strings. 4. devTools on in production. 5. `prefs` survives logout; forced logout does not revoke the server session. 6. Password policy inconsistency. 7. Runtime pdf.js worker from unpkg. 8. Unvalidated server redirects. 9. OIDC token file in the Docker build context (build stage only; inferred low risk). 10. Production deploys on push to `main` with no test or approval step (`build-release.md`); conflicts with aisdlc's production-writes-disabled default, so merge to `main` stays human-controlled.
