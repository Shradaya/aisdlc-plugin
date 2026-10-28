---
name: run
description: Run a QA ticket's Playwright tests so the QA can watch - a visible, slowed-down browser by default (or Playwright UI mode, or headless) - collecting a new evidence folder (HTML report, traces, a screenshot per step and of new tabs; video only with --video), then summarize the results. Use for the first run, after a test fix, and to re-verify once the developer deploys a fix. Use only when the QA engineer runs /aisdlc-qa:run.
argument-hint: <ticket-number> [--watch|--ui|--headless] [--build <id>] [--only S1,S3] [--video]
disable-model-invocation: true
---

# run

## Purpose
Execute the tests tagged `@<TICKET>` against the ticket's environment in a way the QA can follow, and keep the evidence of every run in `tasks/<TICKET>/evidence/run-<N>/`. Triage, defect reporting and sign-off continue in the `test` skill.

## Invocation conditions
Explicit `/aisdlc-qa:run <TICKET> [--watch|--ui|--headless] [--build <id>] [--only S1,S3] [--video]`, or step 7 of `${CLAUDE_PLUGIN_ROOT}/skills/test/SKILL.md`. The task must be in TESTS_GENERATED, TESTS_EXECUTED, AWAITING_DEV_FIX or AWAITING_RESULTS_SIGNOFF.

## Inputs
`$ARGUMENTS`; the task's `environment` (name, build) from `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>`.

## Prerequisites
Playwright installed in the workspace (`/aisdlc-qa:init`); for a form login, `QA_USERNAME` / `QA_PASSWORD` set as environment variables or in the workspace `.env` (check with `node ${CLAUDE_PLUGIN_ROOT}/scripts/qa/cred-check.js`; never read `.env`).

## Procedure
1. `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js get <TICKET>`; stop with the reason if the state is not one of the four above.
2. Re-verification: if the state is AWAITING_DEV_FIX and no `--build` was given, ask the QA which build now holds the fix (AskUserQuestion, "Other" for free text) and pass it as `--build`.
3. Tell the QA what is about to happen: in watch mode (default) a browser window opens and every action is slowed down (QA_SLOWMO, default 500 ms) so they can follow; each step is screenshotted. `--ui` opens Playwright UI mode instead (timeline, before/after snapshots per step; the QA presses run there; no evidence folder). `--headless` runs without a window (same evidence). The per-step screenshots are the proof; add `--video` only when the QA asks for a recording.
4. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/qa/run-tests.js $ARGUMENTS` (`$ARGUMENTS` starts with the ticket; add `--build <id>` from step 2) with a 10-minute timeout (run it in the background for long suites). It signs in first (outside the evidence), runs the tests, writes `run-<N>/{report,artifacts,screenshots,results.json,summary.json,run.json}`, records `runs.<N>` in task state, and prints one JSON line at the end.
   - Exit 2: the workspace is not set up (Playwright not installed, environment not configured): say what to do (`/aisdlc-qa:init`, `config/environments.yaml`) and stop.
   - Exit 1: blocked (production refused, wrong state) or login failed: show the reason and stop; a login failure is an environment problem, not a test result.
   - `--ui`: report that UI mode is open and stop here (no state change).
5. If the state was TESTS_GENERATED, AWAITING_DEV_FIX or AWAITING_RESULTS_SIGNOFF: `node ${CLAUDE_PLUGIN_ROOT}/scripts/state/aisdlc-state.js transition <TICKET> TESTS_EXECUTED`. Append audit `tests-run` (run, mode, build, totals).
6. Open the HTML report for the QA in the background: `node ${CLAUDE_PLUGIN_ROOT}/scripts/qa/pw.js show-report tasks/<TICKET>/evidence/run-<N>/report` (it shows each step with its screenshot, and the trace viewer for each test).
7. Show: run number, environment and build, passed/failed/flaky/skipped, uncovered scenarios, and per failed test the scenario, failing step and first line of the error, with the path of its failing-step screenshot.
8. Continue with triage: step 8 of `${CLAUDE_PLUGIN_ROOT}/skills/test/SKILL.md` (when run during re-verification, its step 11 first).

## Outputs
`tasks/<TICKET>/evidence/run-<N>/**`, `runs.<N>` in task state, state TESTS_EXECUTED.

## Failure behavior
Script exit 1/2: report and stop; never retry against another environment without the QA's choice. A run that produced no `results.json` (crash, timeout): stop in FAILED with the reason; the partial evidence stays in the run folder.

## Safety restrictions
- Never run against production (the script, the hook and `playwright.config.ts` all refuse it); never pass credentials on the command line.
- Never delete or rewrite an earlier run folder; every run is evidence.
