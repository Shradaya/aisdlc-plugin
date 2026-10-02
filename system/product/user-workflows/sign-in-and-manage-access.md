---
workflow: sign-in-and-manage-access
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [controllers/auth.js:34-170, services/v2/auth.v2.service.js, services/v2/cognito.v2.service.js:12-70, middleware/authorize.js:20-95, controllers/admin.js:21-110, services/v2/user.v2.service.js:215-260, services/v2/dashboard.v2.service.js, developer answers 2026-10-02]
---

# Sign In and Manage Access

Consumers: all portal users; Admin, Clinic Admin and RPM User for administration. Steps confirmed by the developer on 2026-10-02.

## Steps

1. A user signs in with email and password, or through single sign-on; a locked or deactivated user is refused.
2. If MFA is on and the device is new or not remembered, an email OTP is required before a token is issued as a cookie and in the response.
3. Each request is checked against the user's role (or the account's role preferences for specific features) and account.
4. A user with secondary roles switches role per account.
5. Admin, Clinic Admin and RPM User create, update, activate and deactivate users; Admin sets account preferences, role preferences and logos.
6. Users view the dashboard by role; Admin and Clinic Admin view user activity logs and progress reports.

Capability: [Access and Account Administration](../capabilities/access-and-account-administration.md).
Rules: [Access rules](../business-rules/access-rules.md).

## Open questions

See the Open questions of the access rules.
