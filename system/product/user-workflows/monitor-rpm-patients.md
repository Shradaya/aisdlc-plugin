---
workflow: monitor-rpm-patients
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_repository: evoke-portal-front-end
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: inferred
confidence: low
evidence: [src/pages/rpm/RPMView.js, src/app/services/rpm/rpmService.js, src/utils/routes.util.js, src/static/constants.js ROLE_INITIAL_ROUTE]
---

# Monitor RPM Patients

Inferred from routes; unconfirmed.

## Steps (inferred)

1. A user whose profile has a Clinii user id opens `/rpm` (RPM-only users land there after sign-in).
2. The portal asks the API for a sign-in link to the Clinii RPM portal and shows it in an embedded frame; monitoring happens inside Clinii.
3. Communication time with the patient can be logged from the patient profile ([Patient Communication](../capabilities/patient-communication.md)).

The older RPM table at `/patient/rpm` is excluded from this documentation at the developer's request.

Capability: [Patient Management and RPM](../capabilities/patient-management-and-rpm.md).

## Open questions

- What the Clinii portal shows and how RPM billing is prepared from it is documented on the API side only ([Billing and RPM rules](../business-rules/billing-and-rpm-rules.md)).
