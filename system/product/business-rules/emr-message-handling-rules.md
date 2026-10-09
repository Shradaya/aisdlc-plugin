---
business_rules: emr-message-handling-rules
analyzed_commit: b9615126ee17c4e2583e08ac81faaa9d12c63005
analyzed_repository: client-emr-hl7-parser
analyzed_at: 2026-10-09T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/eventHandler/contants.py, src/eventHandler/adt.py, src/eventHandler/oru.py, src/eventHandler/ack.py, src/accountHandler/__init__.py, src/database/query.py, developer answers 2026-10-09 (rules to document)]
---

# EMR Message Handling Rules

Capabilities: [Patient and Device Registration](../capabilities/patient-and-device-registration.md), [EHR Export: HL7, SFTP and API Jobs](../capabilities/ehr-export-hl7-sftp-api-jobs.md), [EHR Delivery Acknowledgements](../capabilities/ehr-delivery-acknowledgements.md). Workflows: [Receive patient messages from a client EMR](../user-workflows/receive-patient-messages-from-emr.md), [Export a report to an EHR](../user-workflows/export-report-to-ehr.md). Rules observed in released code; the developer asked for these two to be documented (2026-10-09).

## 1. Client clinic is identified by alias and selects the handler

For an inbound message, the sending application and sending facility are compared with a fixed list of lower-case aliases, each mapped to a client account. For an outbound message, the portal account name (lower-cased) is mapped the same way. The matched account decides which per-account handler builds the acknowledgement, result message, charge message and discrete-data message. Examples: several Tenet clinics share the Tenet handler; CAET, Parkway Cardiology Associates and Knoxville Heart Group share the Covenant handler.

- A sender code written as a prefix plus digits is matched on its first three letters.
- If no alias matches, a sender identified only through the receiving-application field is matched to the Covenant account when a patient with that alias exists.
- A sender that matches no account is treated as unknown: a default acknowledgement is returned, nothing is written for the patient, and a Slack notice "New ADT Clinic Found" is sent.
- Adding or changing an alias requires a code change and deployment.

Evidence: src/eventHandler/contants.py (APPLICATION_FACILITY_MAPPER, CLINIC_IDENTIFIER_FROM_MSH_5), src/eventHandler/adt.py, src/accountHandler/__init__.py.

## 2. New patient from an inbound result gets an onboarding task

When an inbound ORU result message creates or updates a patient, an automated task is created for that patient whose description starts "NEW PATIENT / COMPLETE ONBOARDING PROTOCOL / - AUTOMATED TASK" (three lines: "NEW PATIENT", "COMPLETE ONBOARDING PROTOCOL", and "- AUTOMATED TASK" after a blank line). This is the same kind of onboarding task created when staff enrol a patient (see [Patient management rules](patient-management-rules.md)).

Evidence: src/eventHandler/contants.py (NEW_PATIENT_TASK_DESCRIPTION), src/eventHandler/oru.py.

## 3. Supported inbound message types

ADT A02, A03, A04, A08, A31, ORM O01 and ORU R01 are accepted. Any other type is rejected with an error acknowledgement; a message that cannot be parsed gets a generic rejection acknowledgement. A message already received for the same account and control id is acknowledged as accepted without being stored again.

Evidence: src/eventHandler/contants.py, src/eventHandler/adt.py.

## 4. Outbound message availability per account

- DFT: Denver Health, Toledo, Grand Heart, UCH, Pueblo.
- IDCO ORU: UCH and Pueblo.
- ORU: every account with a handler.
- All outbound messages require the matching HL7 job (and, for ORU, the report documents) to exist.

Evidence: src/accountHandler/__init__.py, src/eventHandler/oru.py, dft.py, idco_oru.py.

## Open questions

- NEW PATIENT task: created only on the ORU path in released code; the developer described ADT and ORM messages as creating it too (needs clarification).
- Why the Covenant receiving-application fallback exists and which clinics rely on it (unconfirmed).
- Terms ADT, ORU, DFT, IDCO ORU, ACK, ORM: standard HL7 meanings assumed (inferred), product definitions unconfirmed; see the glossary.
- Product meaning of the 31-day versus 91-day next send cycle codes (inferred from code, unconfirmed).
