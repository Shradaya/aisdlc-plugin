---
workflow: run-billing-schedule
analyzed_commit: ec1d8894c633996d7fc9e7a9423d21521a981bf6
analyzed_repository: patient-billing-schedule
analyzed_at: 2026-10-05T00:00:00Z
generator: aisdlc@1.0.0
status: inferred
confidence: medium
evidence: [main.py:21-308, src/database/schedule.py:35-151, src/database/schedule.py:376-435, src/database/query.py:87-135, developer answers 2026-10-05]
---

# Run the Billing Schedule

Automatic back-end workflow with no end user. The steps are observed in code; how batch runs are started is `unknown` and the workflow status is `inferred` for that reason. The existence of the three callers is human-confirmed (2026-10-05).

## Triggers

1. **Single patient, after a transmission:** manufacturer-hl7-parser requests a run for the patient once a report has been stored (not for an existing inactive patient). Human-confirmed.
2. **Single patient or account, from the portal back end:** rest-api-evoke requests a run. Human-confirmed that it triggers; mechanism unknown.
3. **Account batch:** a queue or EventBridge-driven trigger asks for all due patients of one or more accounts. Human-confirmed that this path exists; queue, rule and producer are unknown.

## Steps

1. The run collects the patients: the named patient, or the active patients of the account who are due (billing history empty, a cutoff date reached or missing, or next send or late date reached).
2. For each patient and each active billing schedule (31-day, 91-day, custom), the ideal billing date and billing window are worked out (see [Billing Window Scheduling](../capabilities/billing-window-scheduling.md)). Accounts without an active initial report tab for the manufacturer only have next send advanced.
3. If the window has not opened and neither next send nor late date has been reached, the schedule is skipped.
4. The billable report is chosen in the window, other reports of the code in the window are cleared, and a billing date is assigned (backbilling when the window has passed).
5. Next send, late date, the next cutoff and next billing date are updated; patients with no report for 730 days are set inactive.
6. For late patients, follow-up call and letter tasks are created at their due dates; they are archived when a report arrives.
7. A bot event with the patient id is queued for the manufacturer crawler for late patients whose next send was reached.

Each patient is handled in its own pass; the bot event is sent after that patient's database changes are saved.

Rules: [Billing window rules](../business-rules/billing-window-rules.md). Staff work the resulting tasks as described in [Follow up no-show patients](follow-up-no-show-patients.md).

## Open questions

- Queue, EventBridge rule and producer for account batches: unknown.
- Exact mechanism rest-api-evoke uses to trigger runs: unknown.
- Whether the tasks created here are the same ones shown as live-call tasks in the portal: unknown.
