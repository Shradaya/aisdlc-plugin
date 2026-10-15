---
repository: manufacturer-crawler
analyzed_commit: d6aa388a03c12e777846a704818ba5903a021a4f
analyzed_branch: main
analyzed_at: 2026-10-15T08:55:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [Dockerfile, bitbucket-pipelines.yml (read in full), .dockerignore, .gitignore, requirements.txt, sonar-project.properties, README.md, main.py (create_chrome_driver, lambda_handler), utils/secretString.py, utils/config.py, file listing of the snapshot]
---

# Build and release (Phase H)

Static study only: nothing was built, pushed or deployed. The snapshot is a `git archive` with no git metadata, so tags, release history, merge flow and commit conventions are `unknown`. Values living outside the repo (Bitbucket variables, Lambda configuration, ECR registry/repository names, role ARNs, accounts, regions) are `unknown`; only variable names are recorded. `.env.example` and any `.env` were not read.

## Build

Artifact: one container image for AWS Lambda (container image package type), built from the root `Dockerfile`.

| Item | Observed value | Pinned? |
|---|---|---|
| Base image | `public.ecr.aws/lambda/python:3.14` | Only to minor Python version tag; floating, no digest. OS packages are installed with `dnf`, so the underlying distro is the AWS Lambda base (distribution not stated in the file; `dnf` implies an Amazon Linux 2023-style base, unverified) |
| System packages | `dnf install -y atk cups-libs gtk3 libXcomposite alsa-lib libXcursor libXdamage libXext libXi libXrandr libXScrnSaver libXtst pango at-spi2-atk libXt xorg-x11-server-Xvfb xorg-x11-xauth dbus-glib dbus-glib-devel unzip`, then `dnf clean all` | No versions pinned; resolved at build time |
| chromedriver | `https://chromedriver.storage.googleapis.com/114.0.5735.90/chromedriver_linux64.zip`, unzipped to `/opt/` (so `/opt/chromedriver`) | Version pinned in URL (114.0.5735.90); no checksum verification. This legacy storage host is the pre-115 distribution location; whether it is still served: `unknown` (not fetched) |
| Chrome | `https://www.googleapis.com/download/storage/v1/b/chromium-browser-snapshots/o/Linux_x64%2F1135561%2Fchrome-linux.zip?alt=media` (Chromium snapshot build 1135561), unzipped to `/opt/` (so `/opt/chrome-linux/chrome`) | Pinned by snapshot revision 1135561; no checksum. The revision is presumably the Chromium 114 line to match chromedriver 114, but the exact Chromium version was not verified. It is Chromium (not Google Chrome stable), an old browser (mid-2023), with no security updates |
| Python deps | `COPY requirements.txt` then `pip install --no-cache-dir -r requirements.txt` | 38 exact `==` pins, no hashes. Includes `selenium==4.47.0`, `webdriver-manager==4.1.2` (only used in local mode), `pymongo==4.17.0`, `boto3==1.43.68`, `pydantic==2.13.4`, `pycryptodome==3.23.0`, `PyJWT==2.13.0`. Availability on PyPI and Python 3.14 compatibility not verified |
| Application | `COPY . ${LAMBDA_TASK_ROOT}` | n/a |
| Entry point | `CMD ["main.lambda_handler"]` | n/a |

Layer order: system packages, browser downloads, `requirements.txt` copy and `pip install`, then application copy (source edits do not invalidate dependency layers).

`.dockerignore` excludes: `.venv`, `venv`, `__pycache__`, `*.pyc`, `.git`, `.pytest_cache`, `.env`, `.env.example`, `*.md`, `sonar-project.properties`, `bitbucket-pipelines.yml`. It does NOT exclude `Dockerfile`, `tests/` (none today), or `web-identity-token` (see Findings).

Runtime browser configuration (`main.py create_chrome_driver`): in Lambda mode it uses `/opt/chromedriver` and `/opt/chrome-linux/chrome` with headless, `--single-process`, `--no-zygote`, `--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`; in local mode (`LOCAL_EXECUTION` truthy) it uses the paths from `CHROME_BINARY_LOCATION_PATH` and `SELENIUM_SERVICE_EXECUTABLE_PATH` or `webdriver-manager`. Selenium 4.47 against a 114 driver/browser pair is a long-standing pairing risk: compatibility was not verified.

## Pipelines (`bitbucket-pipelines.yml`)

Defines `definitions.services.docker.memory: 3072` and a single pipeline `pipelines.branches.main` with one step. No `pull-requests`, `default`, `tags`, `custom` or `parallel` sections; no `trigger: manual`; no lint, test, scan or post-deploy step.

| Trigger | Step | Environment | Artifact | Deploy target |
|---|---|---|---|---|
| Push to `main` | "Build and update lambda code in main branch" | `deployment: "Production"` | image `$MANUFACTURE_BOT_ECR_REGISTRY/$MANUFACTURE_BOT_IMAGE:latest` | Lambda `$MANUFACTURE_BOT_LAMBDA` and Lambda `$EVENTBRIDGE_BOT_LAMBDA`, both updated with the same image URI |
| Any other branch, PRs, tags | none | n/a | n/a | n/a |

Step properties: image `public.ecr.aws/c7j4d3u2/build-agent-image:latest` (unpinned build agent), `size: 1x`, `oidc: true`, `max-time: 15` minutes, service `docker`.

Script, in order:

1. `ENVIRONMENT="latest"` (used only as the image tag, not an environment selector).
2. `export AWS_REGION=$AWS_REGION`, `export AWS_ROLE_ARN=$AWS_ROLE_ARN` (self-assignments, effectively no-ops).
3. `echo $BITBUCKET_STEP_OIDC_TOKEN > $(pwd)/web-identity-token`, then `export AWS_WEB_IDENTITY_TOKEN_FILE=$(pwd)/web-identity-token` (AWS CLI exchanges this token for role credentials).
4. `aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $MANUFACTURE_BOT_ECR_REGISTRY`.
5. `docker build -t $MANUFACTURE_BOT_ECR_REGISTRY/$MANUFACTURE_BOT_IMAGE:latest .` (build context is the repository root, which contains `web-identity-token` at this point).
6. `docker push` of the same tag.
7. `aws lambda update-function-code --function-name $MANUFACTURE_BOT_LAMBDA --image-uri <image>:latest`, then the same for `$EVENTBRIDGE_BOT_LAMBDA`. Neither call passes `--publish`, so no Lambda version is created and the update lands on `$LATEST`. No wait-for-update (`aws lambda wait function-updated`) and no check of the result.

The step uses `set -e`-like behavior only to the extent Bitbucket's default does (each script line failing stops the step); there is no explicit error handling.

## Environments and promotion model

Only `main` -> Production is defined in the pipeline. Other environments (development, QA, UAT) and their branches: `unknown` (no other branch pipeline, no per-environment variables, no environment-specific tags in the snapshot). Function names, region, account, ECR repository: `unknown`. The pipeline does not distinguish "environment" within the build: `ENVIRONMENT="latest"` is a tag only. Promotion model: a push to `main` rebuilds and redeploys; nothing is promoted between environments. The sibling repositories use per-environment branches (`lf-qa`, `lf-uat`) but that was not verified for this repository.

## What a deploy updates

One image (a single tag `:latest`) is pushed and then used to update the code of two Lambda functions:

1. `$MANUFACTURE_BOT_LAMBDA` (presumably the SQS/direct-invoke bot function; the README names a function `bot_lambda`; the mapping from variable to actual function name is `unknown`).
2. `$EVENTBRIDGE_BOT_LAMBDA` (presumably the scheduler-triggered function; role `unknown`). Both run the same image and handler `main.lambda_handler`; they differ only in configuration outside the repo (environment variables, triggers, timeout, memory, ephemeral storage: all `unknown`).

Because the tag is the mutable `latest` and both functions are updated by image URI, Lambda resolves the tag to a digest at update time; a later push to the same tag does not change a function until `update-function-code` runs again. Event sources, aliases and concurrency settings are `unknown`.

## Release PR flow

Not documented in the repository (`unknown`). Under aisdlc rules the task branch equals the ticket, PRs are for human review, and merge is human-controlled. Merging to `main` immediately builds and deploys to production with no test, manual approval or post-deploy check (observed in the pipeline; Bitbucket deployment permissions and branch restrictions are outside the repo: `unknown`).

## Versioning and tags

No version file, changelog, `pyproject.toml` or `setup.py` in the snapshot. The snapshot has no git metadata, so tags and commit conventions cannot be seen (`unknown`). Image identification: fixed tag `latest`, overwritten on each deploy; no commit SHA or build number tag is applied (`$BITBUCKET_COMMIT` not referenced). Whether ECR tag immutability or lifecycle rules exist: `unknown`. The image digest is the only immutable identifier and the pipeline does not record it.

## Rollback

Not documented or automated: `unknown`. Because only `latest` is tagged and no SHA tag or Lambda version exists, a rollback path would be inferred and unverified: revert the commit on `main` and let the pipeline rebuild (rebuild is not reproducible because base image, `dnf` packages and the Chromium download are not pinned by digest/version in full), or re-point the functions to a previous image digest if ECR still holds the untagged previous image (depends on lifecycle policy, `unknown`). Rolling back code does not undo database writes, Slack posts or SQS messages made by crawls.

## Manual approvals

None in the repository. Bitbucket deployment-environment approvals: `unknown`.

## Production deploy risk

A push or merge to `main` replaces the production crawler code for both Lambda functions, untested. The crawler drives real manufacturer portals with stored credentials and writes report and log data to the production database; a defective release may lock accounts or write bad data beyond a redeploy. The rebuild is not reproducible (floating base tag, unversioned `dnf` packages, unchecksummed downloads from external hosts, a build agent image on `latest`). aisdlc rules: production writes disabled; never push or merge to `main`, never invoke the functions, never run a crawl.

## Findings (safety and CI)

1. OIDC web-identity token is written to the repository root (`$(pwd)/web-identity-token`) before `docker build .`, and `.dockerignore` does not exclude it, while the `Dockerfile` runs `COPY . ${LAMBDA_TASK_ROOT}`. The token JWT is therefore very likely baked into the image pushed to ECR and deployed to both Lambdas (observed placement; outcome inferred, not verified by inspecting an image). Token is short-lived and scoped to the step, but a credential-bearing file persists in image layers. The same pattern exists in sibling repositories' zip pipelines.
2. The browser is a mid-2023 Chromium snapshot (build 1135561) and driver 114.0.5735.90 with no updates and no checksum verification; downloads come from external storage hosts at build time; availability of `chromedriver.storage.googleapis.com` was not verified. Security patch level is `unknown` and likely stale.
3. Mutable `latest` tag only, no SHA/version tag, no recorded digest, no Lambda version/alias: no traceability from a deployed function to a commit, weak rollback.
4. Unpinned inputs: base image tag (no digest), `dnf` packages, build agent image `latest`.
5. No tests, lint, vulnerability scan or smoke check before or after an automatic production deploy; no PR pipeline.
6. `sonar-project.properties` project key belongs to a different repository (`manufacturer-hl7-parser`); not run by the pipeline. Observation only.
7. `requirements.txt` contains the unused-in-Lambda-mode `webdriver-manager` and a full pinned transitive set, `pip install` has no hashes (no `--require-hashes`).
8. `eventHandler/test_report.py` is production code with a test-like name (see `testing.md`); it ships in the image.
9. The `docker` service memory is set to 3072 MB with step size `1x`; whether the build fits is `unknown` (observed only as configuration).
10. Secrets at runtime: `utils/secretString.py` reads `SM_NAME`/`SM_REGION` and loads a Secrets Manager secret at import; manufacturer portal credentials are held in the database (collection read via `getSecret` in `main.py`), not in the image.

## Environment variables and secrets (names only)

Pipeline (Bitbucket variables referenced, values `unknown` and never inspected): `AWS_REGION`, `AWS_ROLE_ARN`, `MANUFACTURE_BOT_ECR_REGISTRY`, `MANUFACTURE_BOT_IMAGE`, `MANUFACTURE_BOT_LAMBDA`, `EVENTBRIDGE_BOT_LAMBDA`; built-in `BITBUCKET_STEP_OIDC_TOKEN` (sensitive); file `web-identity-token` and `AWS_WEB_IDENTITY_TOKEN_FILE` exported in the step. OIDC handling: the token is read from the Bitbucket built-in variable, written to a file, and consumed by the AWS CLI via `AWS_WEB_IDENTITY_TOKEN_FILE` plus `AWS_ROLE_ARN`; the value is never printed by the script (the `echo` is redirected to the file), but see finding 1.

Lambda runtime (read in code): `SM_NAME`, `SM_REGION` (process env, locate the Secrets Manager secret), optional `SLACK_URL`, `LOCAL_EXECUTION`, `CHROME_BINARY_LOCATION_PATH`, `SELENIUM_SERVICE_EXECUTABLE_PATH`, `PROCESSED_BUCKET`; secret keys referenced: `SLACK_URL`, `SLACK_URL_NOSHOW`, `ERROR_SLACK_URL`, `BOT_CHANNEL_ID`, `EVOKE_ALERT_TOKEN`, and database settings used by `setConnection`. `.env.example` not read; any further names `unknown`. The README tells developers to export variables in the virtualenv `activate` script (local use).

## Observability hooks

Observed: Python `logging` via `utils/logger.py` (to CloudWatch through Lambda) and `print` of the received event in `lambda_handler` (the event can contain patient identifiers: PHI risk in logs, unverified); Slack notifications at start, completion and on errors (`utils/slack.py`, `send_slack_msg`); per-patient crawl logs written to the database (`generate_log`); SQS partial batch response (`batchItemFailures`) for retry. Not found: metrics, tracing, alarms, DLQ configuration, health check (Lambda-side configuration is outside the repo: `unknown`).

## Notes for aisdlc

- Task branch equals the ticket. Nothing runs on a task branch; the only automated deployment is on push to `main`, which aisdlc never does.
- Flag in the plan any change to `Dockerfile`, `requirements.txt`, `.dockerignore`, `bitbucket-pipelines.yml` or any new top-level file: all are baked into the production image.
- Treat Chrome/chromedriver and Python 3.14 changes as high risk (browser/driver pairing with Selenium, portal compatibility), with a human-reviewed plan.
- No git metadata in the snapshot: tag and release conventions are `unknown`; confirm with the developer or on the next refresh against a full checkout.
- After release: consolidate into `system/product/`; temporary task artifacts are removed only by the consolidation workflow.
