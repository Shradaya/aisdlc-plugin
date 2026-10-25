<script setup>
const groups = [
  { title: 'Diagnose', steps: [
    { name: 'CREATED' },
    { name: 'TICKET_READY', note: 'Jira snapshot or user-provided details in jira.md' },
    { name: 'UNDER_INVESTIGATION', note: 'reproduce, trace the execution path, form and test root-cause hypotheses' },
    { name: 'ROOT_CAUSE_CONFIRMED', note: 'root-cause.md written' },
    { name: 'REPOSITORIES_IDENTIFIED' },
    { name: 'REPOSITORIES_PREPARED', note: 'source edits become possible from here' },
  ]},
  { title: 'Fix', steps: [
    { name: 'IMPLEMENTING', note: 'minimal fix plus a regression test' },
    { name: 'VALIDATING' },
    { name: 'REVIEWING' },
    { name: 'COMMITTING' },
    { name: 'COMMITTED' },
  ]},
  { title: 'Deliver', steps: [
    { name: 'PR_CREATED' },
    { name: 'CI_VALIDATING' },
    { name: 'COMPLETED', terminal: true },
  ]},
]
const failure = ['BLOCKED', 'WAITING_FOR_INPUT', 'WAITING_FOR_APPROVAL', 'CONFLICTED', 'FAILED', 'CANCELLED', 'CI_FAILED']
</script>

# Bug lifecycle

```text
/aisdlc-dev:bug BUG-5678
```

A bug does **not** need a feature-sized specification by default, so there is no specification approval gate. The investment goes into finding and confirming the root cause instead.

## State diagram

<StateFlow :groups="groups" :failure="failure" />

::: details Plain-text diagram
```text
CREATED
  -> TICKET_READY
  -> UNDER_INVESTIGATION
  -> ROOT_CAUSE_CONFIRMED
  -> REPOSITORIES_IDENTIFIED
  -> REPOSITORIES_PREPARED
  -> IMPLEMENTING
  -> VALIDATING
  -> REVIEWING
  -> COMMITTING
  -> COMMITTED
  -> PR_CREATED
  -> CI_VALIDATING
  -> COMPLETED
```
:::

## What a bug task produces

```text
tasks/BUG-5678/jira.md
tasks/BUG-5678/impact-analysis.md
tasks/BUG-5678/root-cause.md
tasks/BUG-5678/validation.md
```

## The working loop

1. Get the ticket (or [answer the fallback questions](/guide/jira-unavailable): expected behavior, actual behavior, reproduction steps and environment are all required for a bug).
2. Reproduce or understand the symptom, trace the execution path, form root-cause hypotheses and validate one.
3. Identify and prepare the affected repositories (same procedure as for features: stash, checkout `main`, fast-forward pull, create branch `BUG-5678`).
4. Implement the **minimal** fix and add a regression test.
5. Validate, review, commit as `BUG-5678: <changes summary>`, create the PR, validate CI.

## Rules worth knowing

- A bug cannot be closed without regression coverage, unless the test is technically impossible and an explicit waiver is recorded.
- A bug that spans multiple repositories, APIs, databases, infrastructure or security-sensitive behavior may require a mini-plan.
- Source edits are allowed from `REPOSITORIES_PREPARED` up to `COMMITTED`. Before that, in `UNDER_INVESTIGATION` for instance, a hook blocks edits to application source, so diagnosis stays read-only.
- There is no post-release consolidation step for bugs; the lifecycle ends at `COMPLETED` after CI.
- If a bug turns out to need a feature-sized change, stop and start a [feature](/guide/feature-lifecycle).
