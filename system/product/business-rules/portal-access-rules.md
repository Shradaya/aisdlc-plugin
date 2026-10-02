---
business_rules: portal-access-rules
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_repository: evoke-portal-front-end
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: medium
evidence: [src/hooks/useSessionExpiry.js, src/static/constants.js:20-30,945-994,1983-1992, src/utils/otp.util.js, src/utils/routes.util.js, src/containers/AppPage/index.js, src/containers/AppPage/Sidenav/index.js, developer answers 2026-10-02]
---

# Portal Access Rules

The developer confirmed on 2026-10-02 that these code-observed rules are correct and worth documenting. Capabilities: [Access and Account Administration](../capabilities/access-and-account-administration.md). Server-side rules are in [Access rules](access-rules.md).

## Session expiry and one-time codes

- The portal reads the session token's expiry and shows a warning 5 minutes before it expires, with an option to extend the session; if the session expires or the API answers "unauthorized", the user is logged out and sent to the login page. Other open tabs follow.
- A one-time code is 6 digits with no letters. A new code can be requested after a 60-second cooldown. The API can refuse further requests or block validation after too many attempts; the portal shows those errors.

## Role-gated access

- Eight roles: admin, user, assistant, clinic, clinic reviewer, physician, clinic admin, RPM user. Each route and sidebar tab lists the roles allowed (examples: `/billing` Admin only; `/billing-amount` Admin and Clinic Admin; `/no-show-patients` Admin and User; `/transmissions/clinic*` clinic-side roles; `/wearables` Physician only).
- Users who may not open a route are sent to a "not authorized" page; each role has its own landing page after sign-in.
- `/wearables` (CardioOneConnect) appears only for a Physician (primary role) who signed in through Cognito and whose account has a medical center id.
- Some features depend on per-account settings (for example quick-text templates, manual upload by clinic roles) and a few on the customer clinic's name.
- These checks hide screens in the browser; enforcement of access to data is by the API.

## Open questions

- Why Clinic Reviewer is treated differently from other clinic roles in some checks is not documented.
- Whether the API enforces every role list shown in the portal is not examined here.
