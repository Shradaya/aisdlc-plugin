---
business_rules: manufacturer-portal-sync-rules
analyzed_commit: d6aa388a03c12e777846a704818ba5903a021a4f
analyzed_repository: manufacturer-crawler
analyzed_at: 2026-10-15T08:55:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [eventHandler/bot_trigger.py, eventHandler/bot_triggers.py, main.py, manufacturer/Biotronik/biotronik.py, eventHandler/cron_job.py, utils/accounts.py, manufacturer/Abbott_Merlin/utils.py, manufacturer/Medtronic_Carelink/utils.py, manufacturer/Boston_Scientific/boston.py, developer answers 2026-10-15]
---

# Manufacturer Portal Sync Rules

The four rules below were named by the developer on 2026-10-15 as behavior to document and match the code at the analyzed commit. Capabilities: [Manufacturer Portal Next Send Updates](../capabilities/manufacturer-portal-next-send-updates.md), [Manufacturer Portal Account Health](../capabilities/manufacturer-portal-account-health.md), [Device Transmission Report Ingestion](../capabilities/device-transmission-report-ingestion.md). Workflow: [Keep next send in step with the manufacturer portal](../user-workflows/keep-next-send-in-step-with-manufacturer-portal.md).

## Rules

1. **Skipped patients and inactive accounts (developer-confirmed).** A bot event does nothing for a patient whose record is marked in-office-only (`information.in_office_only` is true), and does nothing for an account that is inactive; for an inactive account the sender is told so. Patients missing the flag are treated as crawlable.
2. **Biotronik is export-only (developer-confirmed).** For Biotronik the bot never updates next send in the portal. A bot event only acts when the patient's due date is today, and then it exports the patient's report from the portal to the EMR only if the portal holds a transmission newer than the last export. Each export is recorded in `biotronik_exported_reports`, and a patient already exported that day is skipped.
3. **The scheduled sweep marks uncrawled patients as failed so they are retried (developer-confirmed).** After a scheduled sweep for Abbott, Boston Scientific or Medtronic, each patient of the swept reports that has no crawl result in the last 24 hours receives a Fail row ("No any crawl report found for this patient.") in `manufacturer_crawler_report_status`, so that a later recrawl retries it. This is not done for Biotronik.
4. **A portal login error halts the account (developer-confirmed).** When the portal reports incorrect or expired credentials, the bot sets the manufacturer account inactive, turns its schedule off and records the halt. Because `rest-api-evoke` and `patient-billing-schedule` send bot events only for active accounts, this stops their sends for that account until it is reactivated.

Related observed behavior: a bot-triggered run for an account whose scheduler toggle is off changes nothing in the portal and records the failure "The scheduler toggle is turned off in the UI."

## Open questions

- The recrawl and sweep internals are intentionally not documented; only their outcomes (failed crawls retried, next send kept in step) are product behavior.
- The 24-hour window and other numbers are observed code values; their business rationale is unknown.
- Whether the halt always matches real credential problems (it relies on the portal's message text) is unknown; the product expectation for false positives is unconfirmed.
- How a halted account is reactivated is unknown.
