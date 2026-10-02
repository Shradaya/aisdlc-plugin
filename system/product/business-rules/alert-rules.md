---
business_rules: alert-rules
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [schemas/alertConfiguration.js:6-80, validators/v2/alert_protocol.v2.validator.js:20-100, services/v2/alert_protocol.v2.service.js:8-70, services/v2/alert_configuration.v2.service.js:10-25, developer answers 2026-10-02]
---

# Alert Rules

Capability: [Automated Report Notes and Alerts](../capabilities/automated-report-notes-and-alerts.md). Workflow: [Configure and use alerts](../user-workflows/configure-alerts.md). Developer confirmed these rules on 2026-10-02.

## 1. Alert configuration shape

An account configuration needs at least one alert type, which is red or yellow, each with at least one notification config: period regular or after_hours, a notification method, include-PDF flag, recipients and message content. An active config needs at least one recipient; recipients cannot repeat; email recipients must be valid emails; free text is limited to 100 characters.
Evidence: schemas/alertConfiguration.js:6-80.

## 2. Alert protocol validation

An arrhythmia protocol needs a sub-section; LAAO status is required for AF (arrhythmia sub-section) and AF burden protocols; at least one condition (metric, operator, value) and a device type are required.
Evidence: validators/v2/alert_protocol.v2.validator.js:20-100.

## 3. One protocol per device type per account

Creating a protocol for a device type that already has the same protocol updates it instead of adding a duplicate; one record is stored per device type.
Evidence: services/v2/alert_protocol.v2.service.js:17-70.

## 4. Account-scoped access

Reading or changing alert configuration or protocols requires the account to be among the accounts of the user.
Evidence: services/v2/alert_configuration.v2.service.js:10, 25; services/v2/alert_protocol.v2.service.js:8, 21.

## Open questions

- The clinical thresholds that raise alerts live in parser notes and protocol data and are not documented here.
- Meaning of OAC and LAAO (inferred: anticoagulation and left atrial appendage occlusion); see the glossary.
- Legacy v1 endpoints remain mounted; whether the front end uses them is unknown.
