---
workflow: bill-and-export
analyzed_commit: 4178ce47396c524dfd22a4dd107927b3b28eb100
analyzed_repository: rest-api-evoke
analyzed_at: 2026-10-01T17:57:10Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [services/v2/billing.v2.service.js, services/v2/rpm.v2.service.js:46-380, events/billingTaskEmitter.js, events/cardioOneEventEmitter.js, services/transmissions.js:146-165, services/v2/benchmark-billing.v2.service.js, developer answers 2026-10-02]
---

# Bill, Export to Benchmark and Invoice RPM

Consumers: Admin, Clinic Admin, Evoke staff, clinic users with RPM. Steps confirmed by the developer on 2026-10-02.

## Steps

1. Admin or Clinic Admin maintains per-account billing amounts and billing rules.
2. When a report is saved or processed, the billing date is validated against the code's cycle, and billing history and the implanted schedule are updated.
3. For accounts with billing export, patient insert and update events and a charge event for the processed report go to the Benchmark consumer; Admin can search benchmark billing by date.
4. For RPM patients the system counts billable RPM codes for the period; a user downloads the RPM billing invoice, which is numbered, stored per account and recorded.
5. For accounts linked to a medical center, a CardioOne rhythm-id job is queued after enrolment or update.

Capability: [Billing Code and Schedule Assignment](../capabilities/billing-code-and-schedule-assignment.md).
Rules: [Billing and RPM rules](../business-rules/billing-and-rpm-rules.md).

## Open questions

See the Open questions of the billing and RPM rules.
