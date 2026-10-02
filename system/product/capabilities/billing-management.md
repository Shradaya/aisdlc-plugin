---
capability: billing-management
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_repository: evoke-portal-front-end
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/containers/AppPage/index.js (/billing, /billing-amount), src/containers/Billing, src/containers/Insurances, src/containers/ReferringProviders, src/pages/billingAmount, src/app/services/billing*, src/static/constants.js, developer answers 2026-10-02]
---

# Billing Management

## What it does today

Administrators maintain the reference data and exports that billing depends on.

- **Billing area (`/billing`, Admin only):** insurances and referring providers (`/billing/:view`), including a link to the Benchmark practice-management system for a patient, and a Benchmark billing search whose result is turned into a CSV in the browser.
- **Billing amounts (`/billing-amount`, Admin and Clinic Admin):** view and edit billing amounts.
- **During report review:** billing dates and codes are set on reports (see [Report Review](report-review-notes-and-assignment.md)); billing-code assignment itself happens in [Billing Code and Schedule Assignment](billing-code-and-schedule-assignment.md).

## Implemented by

| Repository | Role |
|---|---|
| evoke-portal-front-end | Billing, insurance, referring-provider and billing-amount screens |
| rest-api-evoke | Billing APIs, Benchmark search and export events |

## Customer visibility

Internal (proposed from route evidence, accepted by the developer 2026-10-02). Clinic Admins can reach `/billing-amount`.

## Open questions

- What billing amounts represent in product terms is not established here.
- Whether Clinic Admins use billing amounts as a customer-facing feature is not confirmed.
