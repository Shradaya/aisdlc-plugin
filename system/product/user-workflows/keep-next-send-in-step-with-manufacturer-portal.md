---
workflow: keep-next-send-in-step-with-manufacturer-portal
analyzed_commit: d6aa388a03c12e777846a704818ba5903a021a4f
analyzed_repository: manufacturer-crawler
analyzed_at: 2026-10-15T08:55:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [main.py, eventHandler/bot_trigger.py, eventHandler/bot_triggers.py, manufacturer/Medtronic_Carelink/patient_crawler.py, manufacturer/Medtronic_Carelink/carelink.py, manufacturer/Abbott_Merlin/abbott.py, manufacturer/Boston_Scientific/boston.py, database/export.py, utils/helpers.py, developer answers 2026-10-15]
---

# Keep Next Send in Step with the Manufacturer Portal

Automatic back-end workflow with no end user (developer-confirmed 2026-10-15). Steps are written from the code; the trigger path from the two senders is developer-confirmed, the queue wiring is unknown.

## Trigger

A bot event arrives on the bot queue from `patient-billing-schedule` (patient id, or a batch of patient ids for one manufacturer and account) or from `rest-api-evoke` (patient id, when next send is edited).

## Steps

1. The crawler reads the patient from Evoke's data. A patient that is not found, or is in-office-only, is not crawled (see [rules](../business-rules/manufacturer-portal-sync-rules.md)).
2. It finds the clinic account for the patient's manufacturer. If the account is inactive, the event stops and the sender is told. For Biotronik, no next send is set (export-only rule).
3. It loads the account's stored portal credentials and checks the account's scheduler toggle; with the toggle off it records a failure and stops.
4. It signs in to the manufacturer portal. A credential error halts the account (see [Manufacturer Portal Account Health](../capabilities/manufacturer-portal-account-health.md)).
5. It searches for the patient by device serial number and checks the patient name matches.
6. It reads the portal's current next send, and works out the date to set from Evoke's next send (7 days earlier for pre-authorization account CVMA).
7. If the portal already shows that date it records "Already Scheduled"; otherwise it sets the new date in the portal and saves.
8. It records the next send before and after, the status and any failure reason in `manufacturer_crawler_report_status` (one latest row per patient) and posts the result to Slack. Failed patients are retried later by a recrawl.

Applies to Abbott, Boston Scientific and Medtronic. A batch event handles each patient of the account in turn with one portal session.

## Open questions

- Queue names, whether the two senders share a queue, and the batching limits: unknown.
- Whether anything updates Evoke's own next send after the portal date changes: unknown; the bot does not.
- Why the pre-authorization account is shifted by 7 days: unknown.
- Which exact event the portal back end sends when staff edit next send, and when in the edit flow: taken from the `rest-api-evoke` documentation, not verified in this repository.
- Step order within the portal (name matching, serial search) is observed for Medtronic in detail; Abbott and Boston Scientific follow the same pattern but were audited at entry-point level only.
