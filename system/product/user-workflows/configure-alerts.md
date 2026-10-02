---
workflow: configure-alerts
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [schemas/alertConfiguration.js:6-80, services/v2/alert_configuration.v2.service.js, services/v2/alert_protocol.v2.service.js:1-110, services/v2/transmission.v2.service.js:301-352, services/v2/transmission.v2.service.js:608-690, services/v2/notifications.v2.service.js, developer answers 2026-10-02]
---

# Configure and Use Alerts

Consumers: Admin (configure), Admin and User (read configuration), reviewers (dispatch). Steps confirmed by the developer on 2026-10-02.

## Steps

1. Admin sets, for an account, the red and yellow alert notification configurations: method, regular or after-hours period, recipients, message content, optional PDF.
2. Admin defines alert protocols per account and device type (note section, sub-section, OAC and LAAO status, conditions, alert type).
3. While reviewing a report, the reviewer chooses alerts to send; the API checks them against the configuration and queues them for the alert-notification worker.
4. Users see in-app notifications for approval requests and results, and mark them read.

Capability: [Automated Report Notes and Alerts](../capabilities/automated-report-notes-and-alerts.md).
Rules: [Alert rules](../business-rules/alert-rules.md).

## Open questions

See the Open questions of the alert rules.
