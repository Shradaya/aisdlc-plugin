---
capability: manufacturer-portal-next-send-updates
analyzed_commit: d6aa388a03c12e777846a704818ba5903a021a4f
analyzed_repository: manufacturer-crawler
analyzed_at: 2026-10-15T08:55:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [main.py, eventHandler/bot_trigger.py, eventHandler/bot_triggers.py, eventHandler/cron_job.py, eventHandler/recrawl.py, manufacturer/Medtronic_Carelink/patient_crawler.py, manufacturer/Abbott_Merlin/abbott.py, manufacturer/Boston_Scientific/boston.py, utils/helpers.py, database/export.py, developer answers 2026-10-15]
---

# Manufacturer Portal Next Send Updates

## What it does today

Each manufacturer runs its own remote-monitoring portal in which a patient has a "next send" date (the date the patient's device is next scheduled to transmit). Evoke keeps its own record of that date on the patient. This capability keeps the two in step: a back-end bot (`manufacturer-crawler`, no end users; developer-confirmed 2026-10-15) signs in to the manufacturer portal with the clinic account's stored credentials, finds the patient, reads the portal's current next send and, when it differs from the date derived from Evoke's record, sets the portal to that date. Abbott, Boston Scientific and Medtronic portals are handled this way. Biotronik is not (see [Biotronik is export-only](../business-rules/manufacturer-portal-sync-rules.md)).

The bot does not change Evoke's own patient record; it changes the portal and records the outcome per patient (see below).

## What triggers it

- A bot event for one patient or for a batch of patients of one account, queued by the billing scheduler (`patient-billing-schedule`) and by the portal back end (`rest-api-evoke`) when next send is edited (developer-confirmed 2026-10-15; the exact queues are not known).
- Failed crawls are retried later and a scheduled sweep catches patients with no recent crawl result; these are internal outcomes and described only in the [rules](../business-rules/manufacturer-portal-sync-rules.md).

## What is recorded

For every patient processed, one status row holds the latest outcome: the next send before and after, a status (Success, Fail, Not Found, In Progress, Already Exported, Already Scheduled, Already Transferred), a failure reason when there is one, the event type and the time. A patient not found in the portal or an account whose scheduler toggle is off is recorded as a failure. Operators also see progress and error notices in Slack, with a screenshot of the portal page on crawl errors.

Workflow: [Keep next send in step with the manufacturer portal](../user-workflows/keep-next-send-in-step-with-manufacturer-portal.md). Rules: [Manufacturer portal sync rules](../business-rules/manufacturer-portal-sync-rules.md).

## Implemented by

| Repository | Role |
|---|---|
| manufacturer-crawler | Sole implementation: Lambda that drives a headless browser against the Abbott Merlin, Boston Scientific Latitude and Medtronic Carelink portals. See [architecture](../../../repositories/manufacturer-crawler/architecture.md) |
| patient-billing-schedule | Queues bot events for late patients whose next send has been reached |
| rest-api-evoke | Queues a bot event when staff edit next send |

## Customer visibility

Internal (proposed, status: inferred). The developer confirmed the bot has no end users but did not confirm whether clinics or staff experience this as a feature.

## Known gap

Related technical capability for retrieving disconnected monitors exists; it is deliberately kept out of product documentation (technical knowledge only, see `repositories/manufacturer-crawler/interfaces.md`).

## Open questions

- Customer-visible or internal: not confirmed (proposed internal).
- Which queue(s) carry the bot events and whether patient-billing-schedule and rest-api-evoke share one: unknown.
- Pre-authorization accounts (account code CVMA): the code sets the portal date 7 days earlier than Evoke's next send for that account; the product reason is unknown.
- Whether Evoke's own `next_send` is updated by another service after the portal is changed: unknown; the bot does not write it.
- Product meaning of "next send" itself is unconfirmed (see the glossary).
- The existing glossary line for "Bot event" differs from this capability's behavior; see the glossary open questions.
