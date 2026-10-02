---
capability: report-review-notes-and-assignment
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [services/v2/transmission.v2.service.js:260-700, services/v2/notes.v2.service.js:35-232, services/transmissions.js:90-170, services/v2/patient_note_deletion_requests.v2.service.js, services/v2/report_banner.v2.service.js:15-115, services/v2/report_templates.v2.service.js:110-160, developer answers 2026-10-02]
---

# Report Review, Notes and Assignment

## What it does today

Clinic staff, physicians and Evoke staff review device transmission reports in the Evoke clinician portal, write notes, sign, and assign them.

- **Review queues:** Evoke staff (Admin, User, Assistant) and clinic users (Clinic, Clinic Reviewer, Physician, Clinic Admin) list their reports separately; a report moves between Evoke and clinic tabs as it is processed, archived or signed.
- **Notes and billing:** reviewers save Evoke notes with a billing date. Alert and warning flags are derived from the notes; a billing date makes the report billable and updates the patient's billing history.
- **Clinic notes and signature:** clinic users add clinic and provider notes and sign; a physician's signature records who signed and when. Signed reports can be unsigned (not by Assistants).
- **Assignment:** a physician of the report's account can be assigned to a report, optionally also as the patient's physician.
- **Note aids:** report templates and note sections per billing code and device group, per-user quick-text snippets, a patient banner on the report (alerts-only, in-office-only, subscription paused or removed, advisories, deactivation), and note suggestions.
- **Archived reports:** archived reports can be listed and downloaded.
- **Patient note deletion requests:** any user can request deletion of a patient note with a reason; approvers are notified and approve or decline.

Workflow: [Review and sign a report](../user-workflows/review-and-sign-report.md). Rules: [Report review rules](../business-rules/report-review-rules.md).

## Implemented by

| Repository | Role |
|---|---|
| rest-api-evoke | Review, notes, signing, assignment, templates, banners, quick text, archived reports, note-deletion requests (API behind the portal) |
| evoke-portal-front-end | Portal screens: transmission worklists for Evoke and clinic roles (`/transmissions*`), report detail (`/patient/report/:reportId`), archived reports; the portal capability name used at onboarding, transmission-report-review, is this capability. See [Review transmissions in the portal](../user-workflows/review-transmissions-in-portal.md) (inferred) |
| manufacturer-hl7-parser | Creates the reports and automated notes that are reviewed here (shared database) |
| alert-notification-worker (not onboarded) | Delivers alert notifications queued during review |

## Customer visibility

Customer-visible (human-confirmed 2026-10-02).

## Open questions

See the Open questions of [Report review rules](../business-rules/report-review-rules.md#open-questions).
