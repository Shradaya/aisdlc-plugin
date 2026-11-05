---
name: add-env
description: Add or change a test environment (qa, uat, staging, ...) in the QA workspace's config/environments.yaml - base URL, login method, whether automation may run there, and the default - or add a production host to blocked_hosts; then check that the environment answers and the login works. Use only when the QA engineer runs /aisdlc-qa:add-env.
argument-hint: <name> [<base-url>] [--login none|form|manual] [--default] [--disabled] [--force] | --block-host <host>|=<host>
disable-model-invocation: true
---

# add-env

## Purpose
Register an environment that QA tests may target, without hand-editing JSON. An environment's name is what `--env <name>` and `QA_ENV` select. Tests never run against production: the production guard runs before anything is written.

## Invocation conditions
Explicit `/aisdlc-qa:add-env <name> [<base-url>] [options]`, or `/aisdlc-qa:add-env --block-host <host>` to add a production host to `blocked_hosts` (`<host>` covers its subdomains too; `=<host>` blocks only that exact host). Run inside a QA workspace.

## Inputs
`$ARGUMENTS`; the QA's answers for anything missing.

## Procedure
1. `--block-host <host>`: run `node ${CLAUDE_PLUGIN_ROOT}/scripts/qa/add-env.js --block-host <host> --dry-run`, show the change, confirm with AskUserQuestion, run it without `--dry-run`, and stop. The script refuses an entry that would also block a configured environment: explain the conflict. When production is the bare domain and the environment a subdomain (`emc-portal.com` / `qa.emc-portal.com`), offer the exact form `--block-host "=emc-portal.com"`. Never write a config that refuses the default environment.
2. Collect what is missing (AskUserQuestion, "Other" for free text), never guessing:
   - **Name** (lowercase, e.g. `qa`, `uat`, `staging`) and **base URL**.
   - **How it signs in**: `Login form with a test account` (form) / `SSO or MFA - I will capture a session by hand` (manual) / `No login` (none). For a form: the login page path; the **visible label text** of the username and password fields and the **text on the sign-in button**, exactly as on screen (for example `Email Address`, `Password`, `Sign In`; matched exactly, so a "toggle password visibility" button is not mistaken for the password field); and the URL pattern after a successful login (for example `**/dashboard`). If the QA gives IDs or selectors instead (`id=email`, `type=submit`), accept them as `--username-selector "#email"`, `--password-selector`, `--submit-selector "button[type=submit]"` (they win over labels); never generated class names (MUI `css-…`, `Mui…-root`), which the script refuses.
   - **Synthetic data only?** Must be yes: run screenshots go to Jira. If not, stop and do not add it.
   - **Allow automation now?** (no = `--disabled`, kept listed but switched off) and **make it the default?** (`--default`).
   If the environment already exists, show its current settings and ask before changing it (`--force`).
3. Preview: `node ${CLAUDE_PLUGIN_ROOT}/scripts/qa/add-env.js <name> --base-url <url> --login <mode> [--login-path ...] [--username-label ...] [--password-label ...] [--submit-name ...] [--username-selector ...] [--password-selector ...] [--submit-selector ...] [--success-url ...] [--default] [--disabled] [--force] --dry-run`. Exit 1 shows why it was refused (production host, bad URL, already exists); explain and stop. Quote values with spaces.
4. Show the resulting entry, confirm with AskUserQuestion, then run the same command without `--dry-run`.
5. Check it: `node ${CLAUDE_PLUGIN_ROOT}/scripts/qa/env-check.js <name> --probe` (reachable, HTTP status).
6. Check the login (when automation is allowed and Playwright is installed):
   - `form`: if `node ${CLAUDE_PLUGIN_ROOT}/scripts/qa/cred-check.js` shows `QA_USERNAME` / `QA_PASSWORD` set (environment or `.env`), run the setup project against it: PowerShell `$env:QA_ENV='<name>'; $env:QA_HEADLESS='1'; node ${CLAUDE_PLUGIN_ROOT}/scripts/qa/pw.js test --project setup --reporter line` (bash: `QA_ENV=<name> QA_HEADLESS=1 node ${CLAUDE_PLUGIN_ROOT}/scripts/qa/pw.js test --project setup --reporter line`). Judge by the exit code, not stderr. When it signs in without a `success_url`, it prints the path the app landed on: offer to set `success_url` to it (`--success-url "**/<path>" --force`), since without it a login that fails with an error message can still pass. On failure, the labels or button name usually differ from the page; ask the QA and re-run step 3 with `--force`.
   - `manual`: tell the QA to capture a session once: `node ${CLAUDE_PLUGIN_ROOT}/scripts/qa/pw.js codegen --save-storage=.auth/<name>.json <base-url>` (sign in, then close the window), and again when it expires.
   - `none`: nothing to check.
7. Report: the entry, reachability, login result, and how to use it (`/aisdlc-qa:test <TICKET> --env <name>`, or `QA_ENV=<name>` in `claude.env` for the default).

## Outputs
`config/environments.yaml` updated (header comments kept); for a manual login, `.auth/<name>.json` once the QA captures it.

## Failure behavior
Refused by the production guard, invalid URL or name, or an existing entry without the QA's consent: nothing is written; explain and stop. Unreachable environment or failing login: the entry stays; report what failed and how to fix it.

## Safety restrictions
- Never add a production environment, and never remove a host from `blocked_hosts` or switch off the production patterns to make an environment pass.
- Never write credentials into `environments.yaml` or anywhere else; credentials are environment variables, or `.env` in the workspace (gitignored, Claude has no access); never `claude.env` or any other file. Never print `.auth/` files or `.env`.
- Synthetic-data environments only.
