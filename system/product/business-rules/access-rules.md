---
business_rules: access-rules
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [controllers/auth.js:44-75, util/constants.js:191-197, middleware/authorize.js:63-78, common/userRoleConstant.js, controllers/admin.js:46-110, services/v2/dashboard.v2.service.js, developer answers 2026-10-02]
---

# Access Rules

Capability: [Access and Account Administration](../capabilities/access-and-account-administration.md). Workflow: [Sign in and manage access](../user-workflows/sign-in-and-manage-access.md). Developer confirmed these rules on 2026-10-02.

## 1. Lockout and sign-in refusal

A user whose account is locked or deactivated cannot sign in. Ten wrong passwords lock the account; a successful sign-in resets the counter. The error for a wrong email or password does not say which is wrong.
Evidence: controllers/auth.js:44-75.

## 2. One-time passcode limits

An OTP is valid for 5 minutes and has 6 digits; at most 10 OTP requests are allowed, and 5 wrong guesses invalidate the OTP.
Evidence: util/constants.js:191-197; services/v2/otp.v2.service.js.

## 3. Role preferences override route roles

For features that carry a preference key (for example the nurse flag, anticoagulation status, manual upload), when the request names an account and that account has role preferences for the key, the roles in the preference replace the roles allowed by the route.
Evidence: middleware/authorize.js:63-78; common/userRoleConstant.js.

## 4. User creation limits

Clinic, Physician, Clinic Reviewer and RPM User roles can belong to one account only; clinic roles and RPM User cannot have secondary roles; the email must be unused; an account cannot have conflicting roles (Physician, Clinic and Clinic Admin on one side, Clinic Reviewer on the other).
Evidence: controllers/admin.js:46-110.

## 5. Dashboard access by role

Revenue is available to Admin, Physician and Clinic Admin; account analytics to Admin and Clinic Admin; patient compliance analytics to Admin only; other dashboard views to the seven standard roles.
Evidence: routes/v2/dashboard.v2.routes.js; services/v2/dashboard.v2.service.js:621, 699, 792.

## Open questions

- Role preference mapping has no entry for Clinic Reviewer and RPM User (common/userRoleConstant.js); the effect on those roles is inferred, not verified.
- Role meanings (Assistant, Clinic Reviewer, Clinic Admin, RPM User) are inferred from code and route permissions.
- Secondary roles: allowed only on accounts the user has, for clinic roles (or RPM User on RPM-only accounts) (user.v2.service.js:233-260); not confirmed.
- Password expiry is not enforced (the check is commented out); intended policy unknown.
- Legacy v1 endpoints remain mounted; whether the front end uses them is unknown.
