---
capability: billing-window-scheduling
analyzed_commit: ec1d8894c633996d7fc9e7a9423d21521a981bf6
analyzed_repository: patient-billing-schedule
analyzed_at: 2026-10-05T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [main.py:21-263, src/utils/constants.py:24-47, src/utils/constants.py:77-194, src/database/schedule.py:35-151, src/database/schedule.py:153-183, src/database/schedule.py:376-435, src/database/query.py:87-220, src/database/query.py:231-290, src/utils/utils.py:4-33, developer answers 2026-10-05]
---

# Billing Window Scheduling

Statement status: statements under "Confirmed by the developer" are `human-confirmed` (developer answers 2026-10-05). Statements under "What it does today" are `observed` in the released code. Term definitions and unconfirmed wiring are `inferred` or `unknown` and are listed under "Open questions".

## What it does today

For each patient with an implanted cardiac device, the system decides which stored transmission report should carry each remote-monitoring billing code, on which billing date, and when the patient's next transmission is expected. It is a back-end capability with no screens; its results appear in the portal as billable reports, billing dates, next-send and late dates, and follow-up tasks.

### Billing codes handled

93297 (HF), 93298, 93294, 93295, 0578T and 93264 (CardioMEMS). 93297 and 93298 are also handled with the " 26" modifier variant, and a report with either spelling can be matched. Codes 93297, 93298 and 93264 follow a 31-day cycle; 93294, 93295 and 0578T follow a 91-day cycle. A patient can also have a custom cycle length (`day_custom`).

### Ideal billing date

Each active schedule of the patient has an "ideal billing date" (inferred term, see Open questions):

- **First-time billing (patient has no billing history):** the date comes from the first of these that exists: the signature-anchored date (see rule 4), the cutoff date already stored in the patient's billing schedule, or the implant date plus a wait period per code (15 days for 93298, 61 for 93297, 31 for 93294, 93295, 0578T and 93264).
- **Recurring billing (patient has billing history):** the signature-anchored date, else the stored cutoff date, else the last billing date for that code (from the schedule or the billing history) plus the cycle length.
- If no ideal date can be determined, that schedule is skipped.

### Billing window

Around the ideal date the system opens a "billing window" (inferred term): a number of days before and after the ideal date within which a report may be billed.

| Case | Days before | Days after |
|---|---|---|
| Recurring, 31-day codes | 7 | 3 |
| Recurring, 91-day codes | 7 | 3 |
| First-time, 93297 | 4 | 2 |
| First-time, 93298 | 3 | 2 |
| First-time, 91-day codes | 4 | 2 |
| 93264 (CardioMEMS), first-time or recurring | 3 | 3 |
| Device flagged as producing summary reports (LINQ-style), recurring | 7 | 2 |
| Device flagged as producing summary reports, first-time | 4 | 2 |

For devices flagged as producing summary reports, the summary report of the window is preferred; if none exists at backbilling time, an ordinary report is accepted.

### Backbilling

When today is at or after the end of the window, the window is widened and the run is treated as a "backbill" (inferred term). The widened range is per code: before the ideal date, 5 to 31 days; after, 3 to 31 days (for example 93298 first-time: 5 before, 15 after; 93297 first-time: 10 before, 15 after; 91-day codes: 10 or 31 before, 31 after; recurring 31-day codes: 15 and 15; 93264: 3 and 3). When backbilling, the latest report in the widened range is preferred; if none is found, the earliest report after the window is used and the billing date is set back from that report's date by the "days after" amount.

### Choosing the billable report and billing date

Within the window the earliest report is chosen (the latest when backbilling). The chosen report becomes the billable report with a billing date; other not-yet-billed reports of the same code in the window are cleared (rule 1). The billing date is the ideal date, moved forward one day when it collides with a date already in the patient's billing history or with the date given to the previous patient in the same run. The next ideal date (cutoff) for that schedule is the billing date plus the cycle, and the patient's next billing date is the earliest cutoff over active schedules.

### Next send and late date

- "Next send" is the date the next transmission is expected; "late date" is 3 days after next send when a report was found.
- When next send has passed by at least a day and a report was found, next send advances by the patient's cycle (31 or 91 days, or the patient's own cycle setting). When no report was found, next send advances by 7 days and the late date is kept.
- When the window has not opened yet, the run still acts if next send or late date has been reached, or the patient is already marked late; it then looks only 7 days back from next send and does not assign a billing date.
- A patient whose account does not use the active initial report tab for the manufacturer only has next send advanced (no billable report assignment).

### Confirmed by the developer (2026-10-05, human-confirmed)

The four rules in [Billing window rules](../business-rules/billing-window-rules.md): one billable report per window; patients with no report for 730 days are set inactive; late patients get follow-up tasks and a bot event; accounts anchored on signature bill from the latest signed report date.

Workflow: [Run the billing schedule](../user-workflows/run-billing-schedule.md).

## Implemented by

| Repository | Role |
|---|---|
| patient-billing-schedule (also called billing-schedule-lambda by the parser) | Does the work: windows, billable report, billing dates, next send and late date, follow-up tasks, bot event (back-end function, no end users; role human-confirmed) |
| manufacturer-hl7-parser | Caller: asks for a run for one patient after a report is stored, unless the existing patient is inactive (human-confirmed) |
| rest-api-evoke | Caller: triggers a run for a patient or account (human-confirmed that it triggers; exact mechanism unknown) |

Account batches arrive through a queue / EventBridge trigger that is not part of the repository (human-confirmed that it exists; details unknown). The crawler bot that receives the late-patient event is documented only by its descriptive name `manufacturer-crawler` (repository name unconfirmed).

## Customer visibility

Not stated separately by the developer. The capability has no end users of its own; its results (billable reports, billing and next-send dates, tasks) appear in the portal, which is customer-visible. Status: inferred.

## Open questions

Inferred term definitions (written from how the code uses each term; not confirmed):

- **Ideal billing date** (inferred): the date a billing code is expected to be billed, derived from implant date, stored cutoff date, last billing date plus cycle, or last signature date.
- **Billing window** (inferred): days before and after the ideal billing date within which a report may be chosen as billable; the numbers above are code values (observed), their rationale is not documented.
- **Backbill** (inferred): billing a report after its normal window has already ended, using a widened range.
- **Next send** (inferred): the date the next transmission from the patient is expected.
- **Late date** (inferred): 3 days after next send; once passed with no report, the patient is late.
- **Summary report / LINQ-style** (inferred): the code treats devices flagged as producing summary reports as LINQ-style and prefers the summary report; the product meaning of "summary report" remains unconfirmed.
- What starts account batches (queue, rule, producer) and how rest-api-evoke triggers runs: unknown.
- Schema owner of the shared patient, report and task collections: unknown. The developer confirmed this service owns `billing_activity_logger` and `manufacturer_crawler_report_status`.
- The bot consumer's repository name is unconfirmed (`manufacturer-crawler` is a descriptive id).
- Whether the business rationale of the window sizes and wait periods is documented anywhere: unknown.
