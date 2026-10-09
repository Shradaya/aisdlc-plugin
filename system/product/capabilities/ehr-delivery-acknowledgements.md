---
capability: ehr-delivery-acknowledgements
analyzed_commit: b9615126ee17c4e2583e08ac81faaa9d12c63005
analyzed_repository: client-emr-hl7-parser
analyzed_at: 2026-10-09T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [main.py, src/eventHandler/__init__.py, src/eventHandler/ack.py, src/database/query.py, src/utils/aws.py, developer answers 2026-10-09 (capability list, internal visibility)]
---

# EHR Delivery Acknowledgements

## What it does today

When a client EMR returns an HL7 acknowledgement (ACK) for a message Evoke sent, the acknowledgement is recorded.

- The raw acknowledgement is stored as a file in the processed bucket under `acks/`, named by the message control id.
- A record pointing at that file is added to the `acks` collection.
- The acknowledgement code from the message is returned to the caller.

This is a back-end function with no end users and no screens. The developer designated it internal (new capability, 2026-10-09). The stored acknowledgements are not shown anywhere in the documented applications; which application reads them is unknown.

Workflow: [Receive patient messages from a client EMR](../user-workflows/receive-patient-messages-from-emr.md).

## Implemented by

| Repository | Role |
|---|---|
| client-emr-hl7-parser | Parses the acknowledgement, stores the file and the `acks` record. Owns the `acks` collection (developer-confirmed 2026-10-09) |
| inbound EMR transport service (not onboarded, name unknown) | Passes the acknowledgement text to the parser |

Architecture: [client-emr-hl7-parser](../../../repositories/client-emr-hl7-parser/architecture.md); cross-repository picture: [system overview](../../architecture/system-overview.md).

## Customer visibility

Internal (developer-confirmed 2026-10-09).

## Open questions

- Whether any process correlates a stored acknowledgement with the originating report or HL7 job, and whether a negative acknowledgement triggers a resend. Not evidenced in the parser (no link is written to the report or job).
- The acknowledgement is stored whatever its code; no behavior depending on the code was observed beyond returning it.
- Identity of the inbound transport service that supplies the acknowledgement text (unknown).
- ACK: standard HL7 meaning assumed, product definition unconfirmed (see glossary).
