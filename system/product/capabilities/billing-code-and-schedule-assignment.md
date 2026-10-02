---
capability: billing-code-and-schedule-assignment
analyzed_commit: e185ff36fe03c649cd7e9750e895c8c43f857c43
analyzed_repository: manufacturer-hl7-parser
analyzed_at: 2026-10-01T17:37:23Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/processor.py:346-408, src/processor.py:458-500, src/processor.py:591-606, src/utils/billingCompatibility.py, src/utils/date.py, src/constants.py, developer answers 2026-10-01]
---

# Billing Code and Schedule Assignment

## What it does today

Each transmission report is tagged with the codes and dates needed for billing, and the billing system is told about the patient.

- **Codes from the device:** the device model determines a billing code, an optional HF billing code and a diagnosis code (stored with the device type).
- **Which report types are created:** the clinic account's "initial report tab" settings decide whether a regular report, an HF report, or both are produced. If a tab is not enabled for the account, its billing code is dropped and that report is not created. If neither remains, the transmission fails with an alert (initial report tab not set).
- **IDTF vs invoice billing:** the account's billing type, together with whether the patient is new and the patient's stored IDTF setting, decides if codes are mapped using the IDTF mapping or the invoice (modifier-stripped) mapping.
- **Dates:** next bill dates (day 31 and day 91 entries on the patient's implanted billing schedule), next send date and late date are calculated from the interrogation date, the implant date and the codes.
- **Notifying billing:** after the report is saved, the billing schedule Lambda is invoked with the patient id, except for an existing patient who is inactive. New patients on an IDTF account with billing export enabled also trigger a `CREATE_PATIENT` event on the Benchmark queue.

## Contribution of rest-api-evoke (added 2026-10-02)

Provenance: rest-api-evoke @ 4178ce47396c524dfd22a4dd107927b3b28eb100, analyzed 2026-10-01T17:57:10Z, aisdlc@1.0.0; status human-confirmed (developer answers 2026-10-02); confidence high.

The portal back end validates and extends billing:
- **Billing dates and codes:** a billing date saved on a report must follow the code's cycle; per-account billing amounts and billing rules are managed by Admin and Clinic Admin.
- **Benchmark:** patient and charge events are sent to the Benchmark consumer for accounts with billing export enabled; Admin can search benchmark billing by date.
- **RPM:** RPM billing codes are counted per patient and period and an invoice workbook is produced and stored per account.
- **CardioOne:** a rhythm-id fetch job is queued for accounts linked to a medical center.

benchmark-sqs-consumer and cardio-one-sqs-consumer (not onboarded) receive the events.

Customer visibility (supersedes the inferred "internal" statement below): customer-visible, human-confirmed 2026-10-02.
Workflows: [bill and export](../user-workflows/bill-and-export.md). Rules: [billing and RPM rules](../business-rules/billing-and-rpm-rules.md).

## Implemented by

| Repository | Role |
|---|---|
| rest-api-evoke | Billing-date validation, billing amounts and rules, Benchmark and CardioOne events, RPM billing and invoices (portal back end) |
| manufacturer-hl7-parser | Assigns codes and dates, stores them, and triggers the billing schedule Lambda and Benchmark event |
| billing-schedule-lambda (not onboarded) | Receives the patient id (behavior not documented here) |
| benchmark-sqs-consumer (not onboarded) | Receives the new-patient event (behavior not documented here) |

## Customer visibility

Internal; the effects are billing schedules and exports visible in other systems (status: inferred).

## Open questions

- Exact billing code values and the full IDTF/invoice mapping tables, and the cycle rules behind day 31/91 dates (in `src/constants.py` and `src/utils/date.py`; not confirmed by the developer).
- What the billing schedule Lambda and Benchmark consumer do with their messages. Unknown.
