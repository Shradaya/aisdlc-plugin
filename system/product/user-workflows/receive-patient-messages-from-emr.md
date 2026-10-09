---
workflow: receive-patient-messages-from-emr
analyzed_commit: b9615126ee17c4e2583e08ac81faaa9d12c63005
analyzed_repository: client-emr-hl7-parser
analyzed_at: 2026-10-09T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [main.py, src/eventHandler/__init__.py, src/eventHandler/adt.py, src/eventHandler/oru.py, src/eventHandler/ack.py, src/database/query.py, developer answers 2026-10-09]
---

# Receive Patient Messages from a Client EMR

Consumers: none directly; this is an automated back-end flow. Its results (patients, ADT records, onboarding tasks) are seen by staff in other Evoke applications. Steps derived from code (parsing events); the caller is an inbound EMR transport service or a manual command-line run (developer-confirmed 2026-10-09).

## Steps

1. A client EMR sends an HL7 message; the inbound transport service passes its text to the parser as a parsing event.
2. The message is parsed. If it cannot be parsed, a generic rejection acknowledgement is returned.
3. Unsupported message types get an error acknowledgement. Supported types are ADT (A02, A03, A04, A08, A31), ORM and ORU.
4. The sending application and facility are matched to a client account ([EMR message handling rules](../business-rules/emr-message-handling-rules.md)). An unknown sender gets a default acknowledgement and a Slack notice; processing stops.
5. The raw message is stored in the processed bucket (`adts/` for ADT and ORM, `ehr_orus/` for ORU).
6. If the account and control id were already received, nothing more is written and the message is acknowledged as accepted.
7. ADT and ORM: the patient is created or updated and an ADT record is stored. ORU: the device is matched, the next send cycle is set, the patient is created or updated, an in-office ADT record is stored and a NEW PATIENT onboarding task is created.
8. The account-specific acknowledgement is returned to the sender through the transport service.
9. Separately, when a client EMR returns an acknowledgement of an Evoke message, an acknowledgement event stores it ([EHR Delivery Acknowledgements](../capabilities/ehr-delivery-acknowledgements.md)).

Errors are logged, reported to Slack and returned in the response with status 202.

Capabilities: [Patient and Device Registration](../capabilities/patient-and-device-registration.md), [EHR Delivery Acknowledgements](../capabilities/ehr-delivery-acknowledgements.md).

## Open questions

- The inbound EMR transport service that supplies the messages and relays the acknowledgement is unnamed and unregistered (unknown).
- Whether the sender retries after an error acknowledgement or status 202 (unknown).
