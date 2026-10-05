---
business_rules: billing-window-rules
analyzed_commit: ec1d8894c633996d7fc9e7a9423d21521a981bf6
analyzed_repository: patient-billing-schedule
analyzed_at: 2026-10-05T00:00:00Z
generator: aisdlc@1.0.0
status: human-confirmed
confidence: high
evidence: [src/database/schedule.py:35-151, src/database/query.py:231-290, src/database/schedule.py:200-316, src/database/schedule.py:365-435, main.py:156-216, src/utils/constants.py:190-211, developer answers 2026-10-05]
---

# Billing Window Rules

The four rules below are confirmed by the developer (2026-10-05) as intended behavior and match the released code. Capability: [Billing Window Scheduling](../capabilities/billing-window-scheduling.md). Workflow: [Run the billing schedule](../user-workflows/run-billing-schedule.md).

## Rules

1. **One billable report per billing window (human-confirmed).** For a patient, billing code and billing window, exactly one report is marked billable with a billing date; other reports of that code in the window that have not yet been billed are cleared of their billable flag. Evidence: `src/database/schedule.py:75-102`, `src/database/query.py:231-286`.
2. **No report for 730 days means inactive (human-confirmed).** An active patient with no report in the current window and no report in the previous 730 days (patients created within the last 730 days count as having a report) is set inactive with the reason "No Longer Monitoring". Evidence: `src/database/schedule.py:108-121`, `src/database/schedule.py:365-374`, `src/utils/constants.py:205-206`.
3. **Late patients get follow-up tasks and a bot event (human-confirmed).** A patient with no report when the late date passes is marked late. Automated tasks are created for staff: first call 2 days after the late date, second call 9 days, third call 16 days, and a letter 20 days after; each new task archives the previous one, and a suspend date 30 days after the late date is recorded. When a report is later found, the open follow-up tasks are archived and the patient returns to on-schedule. For late patients whose next send has been reached, a bot event with the patient id is queued for the manufacturer crawler (at most once per patient per run; not sent for Boston Scientific ILR patients without a report). Evidence: `src/database/schedule.py:200-316`, `src/database/schedule.py:392-435`, `src/utils/constants.py:70-75`, `src/utils/constants.py:209-211`.
4. **Signature-anchored accounts bill from the latest signed report date (human-confirmed).** For accounts whose billing setting anchors the next process date on signature, the ideal billing date is the date of the patient's latest signed report for that code plus the cycle length; when no signed report exists the usual sources (stored cutoff date, last billing date, implant date) are used. Other accounts use the usual sources. Evidence: `main.py:174-178`, `main.py:198-202`, `src/database/query.py:388-418`, `src/utils/constants.py:192-194`.

## Not documented here

Exclusions and error-handling details that the developer asked to leave out of product documentation are intentionally not described.

## Open questions

- Confirmed rules say "one report per window"; the definitions of billing window and ideal billing date remain `inferred` (see the capability document).
- The numbers (window sizes, wait periods, task offsets) are observed code values; their business rationale is unknown.
- Whether other callers or batch runs apply the same rules: unknown beyond the confirmed callers.
