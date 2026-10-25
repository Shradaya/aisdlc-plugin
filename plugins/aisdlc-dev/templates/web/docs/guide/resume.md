# Resume

All aisdlc workflows are resumable. If your session ended, your laptop slept, a command failed halfway or you were blocked and have fixed the cause:

```text
/aisdlc-dev:resume FEAT-1234
```

## What resume does

1. Reads `task.yaml`.
2. Inspects the state of each repository.
3. Inspects the current branch of each repository.
4. Compares the branches against the task metadata.
5. Determines the last completed gate.
6. Validates the required artifacts.
7. Continues from the first incomplete **safe** state.

## When resume refuses to continue

If the repository state differs from what the task recorded (for instance you switched branches, or the branch was changed outside the workflow), the task enters:

```text
CONFLICTED
```

and stops rather than guessing. Nothing is overwritten. Fix the difference yourself (usually by checking out the ticket branch again, or deciding deliberately what to keep) and run resume again.

## Common situations

| Situation | What happens |
|---|---|
| Session closed during `IMPLEMENTING` | Resume re-reads the state, verifies the branch is `FEAT-1234` in each affected repository and continues. |
| Waiting on specification approval | Resume shows the gate is still pending. It will not proceed until the [specification is approved](/guide/approvals). |
| Jira was down and is back | Resume re-checks the ticket before implementation. If it changed materially after approval you will need to [reapprove](/guide/approvals). |
| `main` cannot fast-forward | The workflow stops for human resolution for that repository. aisdlc never merges or rebases a diverged `main` for you. |
| Branch `FEAT-1234` exists, no task record | Resume is not allowed to adopt it. aisdlc stops and asks you to act, and never overwrites the branch. |
| CI failed | The task is in a failed CI state with the failing checks recorded. Fix, push, then resume. |
| A step failed (`FAILED`, `BLOCKED`) | The state before the failure is remembered; resume continues from there after you fix the cause. |

## Tips

- Use `/aisdlc-dev:status` first to see the task state and any conflict.
- Do not edit `tasks/<ticket-number>/task.yaml` by hand. It can only be changed through the workflow, and edits are blocked.
- If you were mid-stash: the pre-task stash is named `aisdlc: <ticket-number> pre-task stash` and its reference is in `repository-preparation.yaml`. It is never popped automatically, so your earlier local changes are safe.
