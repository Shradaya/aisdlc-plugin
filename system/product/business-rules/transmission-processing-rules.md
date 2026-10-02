---
business_rules: transmission-processing-rules
analyzed_commit: e185ff36fe03c649cd7e9750e895c8c43f857c43
analyzed_repository: manufacturer-hl7-parser
analyzed_at: 2026-10-01T17:37:23Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [src/processor.py:241-250, src/delay_message_processing.py:21-37, src/processor.py:172-187, src/processor.py:264-295, src/processor.py:410-478, developer selections 2026-10-01]
---

# Transmission Processing Rules

The developer selected these four rules to be documented as product behavior (human-confirmed that they should be documented; wording below is derived from code).

## 1. Duplicate transmissions are skipped

A file whose HL7 control id already exists on a stored report is not processed again. An informational Slack message is sent. As a backstop, the code treats a database duplicate-key error on the control id as a duplicate transmission (whether the unique index exists is unknown).
Capability: Device Transmission Report Ingestion.

## 2. Abbott ILR reports are delayed

A transmission from Abbott for an ILR device that is not a summary report, received from S3, is not processed immediately; it is placed on the delay queue and processed when it comes back from the queue. If the delay queue is not configured, the transmission is processed immediately. Abbott ILR arrivals are recorded with arrival time and the related event/summary report ids.
Why the delay exists is not confirmed (see Open questions).
Capability: Device Transmission Report Ingestion.

## 3. An HF report is a second report

When the device type has an HF billing code and the clinic account's HF initial report tab is enabled, the transmission produces a second, HF report with its own notes and flags in addition to the regular report. For the "Centra Heart Failure" sub-account the HF report is stored under the account name "Centra Heart Failure". If the account has neither tab enabled, the transmission fails with an alert.
Capabilities: Billing Code and Schedule Assignment, Automated Report Notes and Alerts.

## 4. Device mismatch and generation change

A transmission is accepted for an existing patient only if its device model equals the patient's stored model, matches one of the patient's previous devices or the secondary device, or the patient name matches. Otherwise it is rejected with a Slack alert. A patient found by name and date of birth, but with a new device serial number, is treated as a generation change and a "Duplicate Patient Identified" notice with the Evoke ID is sent.
Capability: Patient and Device Registration.

## Observed but not confirmed by the developer

- A new patient without a name in the message is not created; a Slack notice is sent.
- Existing inactive patients are not sent to the billing schedule Lambda.
- Benchmark events are sent only for new patients on IDTF accounts with billing export enabled.

## Open questions

- Purpose and duration of the Abbott ILR delay (queue delay is configured outside the repository).
- Whether the "-HF" report should be visible to clinics as a separate report in the product.
