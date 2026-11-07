# Approval gates

aisdlc has two human approval gates, `specification` and `plan`, plus an external-fact gate (verified production release) described in [post-release](/guide/post-release-and-finish).

## Gate 1: specification approval

After the feature specification is generated, aisdlc stops and presents a checkpoint with three choices:

```text
Approve specification
Request changes
Reject task
```

The task sits in `AWAITING_SPEC_APPROVAL`. **Until the specification is approved, implementation is blocked**: aisdlc may edit task artifacts but a hook refuses any change to application source in the registered repositories.

You can also use the convenience commands:

```text
/aisdlc-dev:approve FEAT-1234 specification
/aisdlc-dev:reject FEAT-1234 specification <reason>
```

Approval is recorded in the task's approvals (retained after cleanup in `approvals.yaml`), including who approved, when, the version, and a hash of the specification that was approved:

```yaml
specification_approval:
  status: approved
  version: 1
  approved_at: 2026-10-01T21:45:00+05:45
```

### If the specification changes after approval

```text
version 1 approved
        |
material change
        |
version 2
        |
approval reset to pending
```

Approval applies to a specific version of the specification. If the file changes after approval, implementation is blocked again with `Specification for FEAT-1234 changed after approval; reapproval required.` Review the change and approve the new version.

### If the ticket changes after approval

Before implementation aisdlc re-checks the Jira ticket when the integration is available. If material content changed after approval:

```text
SPEC_APPROVED -> JIRA_CHANGED -> SPEC_REVIEW_REQUIRED -> REAPPROVAL
```

Implementation stays blocked until you reapprove.

## Gate 2: plan approval

The implementation plan is separate from the specification: the specification says *what* the system should do, the plan says *which exact changes* implement it. Every feature plan requires your approval before implementation, whatever the size of the change (`AWAITING_PLAN_APPROVAL`):

```text
/aisdlc-dev:approve FEAT-1234 plan
/aisdlc-dev:reject FEAT-1234 plan <reason>
```

The plan gate is never skipped: the state engine refuses `IMPLEMENTING` until the plan is approved. (Bug fixes have no plan gate unless they are large enough to need a mini-plan.)

## Rejecting

`/aisdlc-dev:reject <ticket-number> <gate> <reason>` records the reason and the gate stays unapproved. The reason is shown in the task state so the next reader knows what to change.

## Things that are never approvals

- Silence, or continuing the conversation, does not approve a gate.
- Editing `task.yaml` by hand is blocked; approvals can only change through approve or reject.
- A bug has no specification gate, but its commits, branches and tests are still enforced by hooks.

## Seeing what is waiting

`/aisdlc-dev:status` lists pending approvals. `/aisdlc-dev:status-page` opens a live page in your browser that counts them, shows each gate's approver, time and version, and warns when an approved document changed after approval.
