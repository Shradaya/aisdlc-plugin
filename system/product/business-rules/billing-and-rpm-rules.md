---
business_rules: billing-and-rpm-rules
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [util/v2/billingCode.v2.util.js:36-60, services/v2/rpm.v2.service.js:112-215, services/v2/billing.v2.service.js:128, services/v2/billing_amount.v2.service.js:26, events/cardioOneEventEmitter.js:30-60, events/billingTaskEmitter.js:16, services/transmissions.js:146-165, developer answers 2026-10-02]
---

# Billing and RPM Rules

Capability: [Billing Code and Schedule Assignment](../capabilities/billing-code-and-schedule-assignment.md). Workflow: [Bill, export to Benchmark and invoice RPM](../user-workflows/bill-and-export.md). Billing date cycles are in [Report review rules](report-review-rules.md). Developer confirmed these rules on 2026-10-02.

## 1. Billing type decides the code style

IDTF accounts use modifier codes (93297 and 93298 with 26) and no additional 93296 code; INVOICE accounts use codes without modifier and require 93296 with 93294 or 93295; SPLIT accounts treat new patients as IDTF and existing patients by their own IDTF flag (invoice when missing). A missing billing type means IDTF.
Evidence: util/v2/billingCode.v2.util.js:36-60.

## 2. RPM code counts

For a billing period: 99453 (initiation) is counted once when device data is first initiated; 99454 needs at least 16 unique days of readings (blood pressure, otherwise weight); 99457 needs 20 or more minutes of logged communication; 99458 is counted once per each additional full 20 minutes.
Evidence: services/v2/rpm.v2.service.js:112-215.

## 3. No duplicates

The same billing date cannot be assigned twice to the same report and code in the billing history, and an account has at most one billing amount record.
Evidence: services/v2/billing.v2.service.js:128; services/v2/billing_amount.v2.service.js:26.

## 4. Export gating

Benchmark patient and charge events are sent only for accounts with billing export enabled (patients must be IDTF for insert and charge). A CardioOne rhythm-id job is created only for accounts linked to a medical center and only when no initiated or completed log exists for the patient. Queue failures are only logged.
Evidence: events/billingTaskEmitter.js:16; services/transmissions.js:146-165; events/cardioOneEventEmitter.js:30-60; services/v2/benchmark.v2.service.js.

## Open questions

- Clinic Admin can use RPM features only for accounts marked as SaaS accounts (rpm.v2.service.js:46-56); not in the confirmed list.
- Disallow rules in billing_rules exclude combinations of account, manufacturer, billing code and date range from benchmark export (billing_rules.v2.service.js:21-60); not confirmed.
- RPM invoice numbering and storage under invoices/<account>/ (rpm.v2.service.js:343-378) is described in the workflow only.
- Terminology (inferred): IDTF, INVOICE, SPLIT, RPM codes 99453, 99454, 99457, 99458, HF (93297), ILR (93298): see the glossary.
- Legacy v1 endpoints remain mounted; whether the front end uses them is unknown.
