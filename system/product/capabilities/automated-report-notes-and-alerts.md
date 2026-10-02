---
capability: automated-report-notes-and-alerts
analyzed_commit: e185ff36fe03c649cd7e9750e895c8c43f857c43
analyzed_repository: manufacturer-hl7-parser
analyzed_at: 2026-10-01T17:37:23Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/notes/automate.py, src/notes/note_creator.py, src/notes/noteCreator/*, src/notes/constants.py, src/notes/query.py, src/processor.py:139-190, src/manufacturer/boston.py, src/manufacturer/biotronik.py, developer answers 2026-10-01]
---

# Automated Report Notes and Alerts

## What it does today

For every new transmission report the pipeline writes clinical notes automatically and sets alert indicators, so staff reviewing the report start with a pre-filled summary instead of reading every value.

- Notes are produced per section. Sections present in the code: arrhythmias, battery, burden, high-voltage impedance, impedance, leads, pacing, pacing percentage, presenting rhythm, sensing, thoracic impedance and threshold.
- Which sections and wording apply depends on configuration stored with the device group and the clinic account (note settings and note content format), not on fixed text in the pipeline.
- Notes can raise report-level warning and critical flags, and mark the patient as alerted. The flags are saved on the report, and per-patient alert metadata (battery, sensing, pacing percentage, arrhythmias) is stored for later comparisons.
- For Boston Scientific and Biotronik, manufacturer transmission alerts carried in the message are mapped onto the report; Abbott and Medtronic reports produce none from the message (code evidence, medium confidence).
- Notes are recorded under the automated service user "EVOKE AUTOMATED NOTES".
- When an HF (second) report is created for the same transmission, notes and flags are generated for it separately.

## Contribution of rest-api-evoke (added 2026-10-02)

Provenance: rest-api-evoke @ 4178ce47396c524dfd22a4dd107927b3b28eb100, analyzed 2026-10-01T17:57:10Z, aisdlc@1.0.0; status human-confirmed (developer answers 2026-10-02); confidence high.

The portal back end lets staff configure and use alerts:
- **Alert configuration:** per account, red and yellow alerts with notification method, time period, recipients, message content and optional PDF attachment (Admin edits, Admin and User read).
- **Alert protocols:** per account and device type rules (note section, sub-section, OAC and LAAO status, conditions, alert type) managed by Admin.
- **Dispatch during review:** when a reviewer saves notes, selected alerts are queued to the alert-notification worker, only to recipients allowed by the configuration. In-app notifications (approval requests and results) are listed and marked read.

alert-notification-worker (not onboarded) delivers the queued alerts.

Customer visibility (supersedes the inferred "internal" statement below): customer-visible, human-confirmed 2026-10-02.
Workflows: [configure alerts](../user-workflows/configure-alerts.md). Rules: [alert rules](../business-rules/alert-rules.md).

## Implemented by

| Repository | Role |
|---|---|
| rest-api-evoke | Alert configuration, alert protocols, alert dispatch during review, in-app notifications (portal back end) |
| manufacturer-hl7-parser | Generates and stores notes, alert flags, alert metadata and patient analytics |

The note templates, sections and alert protocols are read from configuration collections owned elsewhere (owner repositories unknown).

## Customer visibility

Internal generation; the notes appear on reports in other Evoke applications (status: inferred).

## Open questions

- The clinical thresholds and wording rules that raise a warning or a critical flag per section. They are in `src/notes/noteCreator/*` and configuration data and have not been documented or confirmed by the developer.
- Which application edits or reviews the generated notes. Unknown.
