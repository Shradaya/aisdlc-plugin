---
workflow: review-transmissions-in-portal
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_repository: evoke-portal-front-end
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: inferred
confidence: low
evidence: [src/containers/AppPage/index.js (/transmissions*), src/static/constants.js:1396-1440 (tabs), src/static/constants.js ROLE_INITIAL_ROUTE, src/utils/routes.util.js]
---

# Review Transmissions in the Portal

Inferred from route, tab and role names only; the developer chose to document the inferred flow rather than supply steps (2026-10-02). Treat as unconfirmed.

## Steps (inferred)

1. After sign-in the user lands on a role-specific worklist: Evoke Admin and User on `/transmissions`, Assistant on `/tasks`, Clinic, Clinic Admin and Clinic Reviewer on `/transmissions/clinic`, Physician on `/transmissions/clinic-review`.
2. Evoke staff work the active list and then the processed list (`/transmissions`, `/transmissions/processed`); clinic roles work `/transmissions/clinic`, then `/transmissions/clinic-review` (physicians and clinic users), then `/transmissions/clinic-processed`. Clinic roles opening `/transmissions` are redirected to their own list.
3. The user opens a report (`/patient/report/:reportId`), views the PDF, reads the generated notes and alerts, writes notes, sets the billing date, signs or processes it (actions behind the API: [Review and sign a report](review-and-sign-report.md)).
4. The patient profile (`/patient/:patientId`) opens from the report for demographics, device and billing details.

Capability: [Report Review, Notes and Assignment](../capabilities/report-review-notes-and-assignment.md) (portal name used in the interview: transmission-report-review).

## Open questions

- The exact meaning of each worklist and what moves a report between them is documented only for the API side; the portal-side steps are unconfirmed.
