---
workflow: review-and-sign-report
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [services/v2/transmission.v2.service.js:260-700, services/v2/transmission.v2.service.js:1127, services/v2/transmission.v2.service.js:1704, services/v2/notes.v2.service.js:35-232, services/transmissions.js:90-170, developer answers 2026-10-02]
---

# Review and Sign a Report

Consumers: Evoke staff (Admin, User, Assistant), clinic users (Clinic, Clinic Reviewer, Physician, Clinic Admin). Steps confirmed by the developer on 2026-10-02.

## Steps

1. An Evoke user lists reports (clinic users list their clinic's reports) and opens one, with previous reports and alerts.
2. The reviewer saves Evoke notes and a billing date. Alert and warning flags follow the notes; a billing date marks the report billable and updates the patient's billing history; selected alerts are queued for notification.
3. The Evoke user processes or archives the report; it moves to a clinic tab (or is archived when it has no billing date, no non-billable flag and no alert). Processing can also send a letter, a Benchmark charge, HL7 and SFTP exports.
4. A clinic user adds a clinic note and signs; a physician's signature records signer and time. A provider note is a separate entry.
5. A physician of the account can be assigned to the report, optionally also as the patient's physician.
6. Supporting actions: report templates and sections, quick-text snippets, patient banner, archive and download of archived reports, requesting deletion of a patient note.

Capabilities: [Report Review, Notes and Assignment](../capabilities/report-review-notes-and-assignment.md), [Automated Report Notes and Alerts](../capabilities/automated-report-notes-and-alerts.md), [EHR Export](../capabilities/ehr-export-hl7-sftp-api-jobs.md).
Rules: [Report review rules](../business-rules/report-review-rules.md).

## Open questions

See the Open questions of the report review rules.
