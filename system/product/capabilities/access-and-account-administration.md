---
capability: access-and-account-administration
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [controllers/auth.js:34-170, services/v2/auth.v2.service.js, middleware/authorize.js:20-95, controllers/admin.js:21-110, services/v2/cognito.v2.service.js:12-70, services/v2/user.v2.service.js:215-260, services/v2/account.v2.service.js, services/v2/dashboard.v2.service.js, developer answers 2026-10-02]
---

# Access and Account Administration

## What it does today

People sign in to the portal, see only their accounts, and administrators manage users and accounts.

- **Sign-in:** email and password (the account locks after repeated failures), optional email one-time passcode (MFA) with remembered devices, or single sign-on through Cognito identity providers.
- **Roles:** Admin, User, Assistant, Clinic, Physician, Clinic Admin, Clinic Reviewer, RPM User. Each route allows a set of roles; per-account role preferences can replace the allowed roles for specific features. Users with secondary roles can switch role per account.
- **User administration:** Admin, Clinic Admin and RPM User create, update, activate and deactivate users within the creation limits.
- **Accounts and reference data:** account list, preferences and role preferences, logos, hospitals, EHR users, referring providers, insurances.
- **Dashboard and activity:** transmission, patient, doctor, device, revenue and compliance analytics by role; user activity logs and transmission-progress reports for Admin and Clinic Admin.
- **Notifications:** in-app notifications for approvals.

Workflow: [Sign in and manage access](../user-workflows/sign-in-and-manage-access.md). Rules: [Access rules](../business-rules/access-rules.md).

## Implemented by

| Repository | Role |
|---|---|
| rest-api-evoke | Authentication, MFA, SSO, authorization, user and account administration, dashboard, activity logs |
| evoke-portal-front-end | Portal sign-in (password, one-time code, Cognito single sign-on), session-expiry warning, password reset, role-based routes and tabs, role switching; this is the portal capability named access-and-authentication at onboarding. Rules: [Portal access rules](../business-rules/portal-access-rules.md); configuration screens: [Administration and Configuration](administration-and-configuration.md) |
| cognito-m2m-rhythm (external client) | Reads a user profile for SSO through the API |

## Customer visibility

Customer-visible (human-confirmed 2026-10-02).

## Open questions

See the Open questions of [Access rules](../business-rules/access-rules.md#open-questions).
