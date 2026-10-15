---
capability: manufacturer-portal-account-health
analyzed_commit: d6aa388a03c12e777846a704818ba5903a021a4f
analyzed_repository: manufacturer-crawler
analyzed_at: 2026-10-15T08:55:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [utils/accounts.py, manufacturer/Abbott_Merlin/utils.py, manufacturer/Medtronic_Carelink/utils.py, manufacturer/Boston_Scientific/boston.py, eventHandler/recrawl.py, database/db_secret.py, developer answers 2026-10-15]
---

# Manufacturer Portal Account Health

## What it does today

Evoke signs in to manufacturer portals with credentials stored per clinic account (`manufacturer_accounts`, owned by `rest-api-evoke`). The crawler bot watches the health of each account while it works:

- When a portal rejects the stored credentials (incorrect or expired password), the bot sets the account inactive, turns its schedule off and records who halted it (the bot), why and when. A "credentials expired" notice goes to a dedicated Slack channel. Developer-confirmed 2026-10-15 for the halt and its effect.
- The account's last crawl state (Success, Fail or In Progress, how far it crawled, whether the password expired and when) is kept per manufacturer and account in `manufacturer_crawler_account_status` (owned by the crawler, developer-confirmed).
- Events for an inactive account are not crawled; the sender is told the account is inactive. An account with its scheduler toggle off gets a failure status instead of a portal change.

A halted account stays halted until someone reactivates it elsewhere (the bot never reactivates). Because other services only send work for active accounts, a halt also stops bot events from `rest-api-evoke` and `patient-billing-schedule` for that account. See [Manufacturer portal sync rules](../business-rules/manufacturer-portal-sync-rules.md).

## Implemented by

| Repository | Role |
|---|---|
| manufacturer-crawler | Detects credential errors, halts accounts, keeps account crawl status. See [architecture](../../../repositories/manufacturer-crawler/architecture.md) |
| rest-api-evoke | Owns `manufacturer_accounts` and its credential screens; reads the active flag |

## Customer visibility

Internal (proposed, status: inferred). Not confirmed whether clinics see halted accounts anywhere.

## Known gap

Related technical capability for retrieving disconnected monitors exists; it is deliberately kept out of product documentation (technical knowledge only, see `repositories/manufacturer-crawler/interfaces.md`).

## Open questions

- Customer-visible or internal: not confirmed.
- How a halted account is reactivated and who is told: unknown beyond the Slack notice.
- The halt is triggered by matching the portal's error text; a changed portal message would not halt the account (observed in code, product impact unconfirmed).
- Whether `patient-billing-schedule` and `rest-api-evoke` both skip inactive accounts as stated in their own documentation: taken from the crawler's relationship notes, not re-verified here.
