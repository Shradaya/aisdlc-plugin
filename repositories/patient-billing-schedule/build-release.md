---
repository: patient-billing-schedule
remote_name: patient-schedule-monitoring
analyzed_commit: ec1d8894c633996d7fc9e7a9423d21521a981bf6
analyzed_branch: main
analyzed_at: 2026-10-05T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [bitbucket-pipelines.yml, requirements.txt, .gitignore, src/config.py, src/utils/aws.py, src/utils/slack.py, src/utils/logger.py, main.py, file listing of the 27 tracked files]
---

# Build and release (Phase H)

Static study only: nothing was built, zipped, uploaded or deployed. The snapshot has no git metadata, so tags, release history and merge flow are `unknown`. Values living outside the repository (Bitbucket variables, Lambda configuration, bucket names, role ARNs) are `unknown`; only variable names are recorded.

## Build

No build step beyond packaging. There is no Dockerfile, no `pip install`, no virtualenv or layer build, no SAM/CDK/Terraform/Serverless file, no `Makefile` and no `package.json` among the 27 tracked files. The deployable artifact is a zip of the repository working tree created in the branch pipeline (`bitbucket-pipelines.yml`, `zip -r $ZIP_NAME .` at lines 21, 45, 69).

Consequences (observed, outcome inferred):

- Dependencies in `requirements.txt` are never installed or vendored by the pipeline, so the zip contains only the source. Runtime packages not provided by the Lambda base image (`pymongo`, `python-dateutil`, `requests` depending on runtime, `dnspython`, `mongoengine`) must come from a Lambda layer or from the function's existing configuration. Which layer, if any: `unknown`.
- The Lambda handler is `lambda_handler` in `main.py` (`main.py:266`); the configured handler string (`main.lambda_handler` presumed), runtime, architecture, timeout, memory, concurrency, triggers (SQS event source via `Records`, direct invoke, or HTTP via `body`) and environment: `unknown` (not in repo).
- What the zip contains: everything tracked except `.gitignore`, `bitbucket-pipelines.yml` and `.git`, which the script deletes before zipping. So it includes `.env-example`, `.vscode/launch-example.json`, `requirements.txt`, and `web-identity-token` (see Findings). `.env` is gitignored and absent on a fresh clone.
- `requirements.txt` is UTF-16 encoded with a BOM and exact-pins 14 packages including an unused `mongoengine`.

## Pipelines (`bitbucket-pipelines.yml`)

73 lines. Only `pipelines.branches`; no `pull-requests`, `default`, `tags`, `custom`, `parallel` or `definitions` section; no `deployment:` key; no `trigger: manual`; no lint, test, scan or post-deploy check.

| Trigger | Step | Environment | Artifact | Deploy target |
|---|---|---|---|---|
| Push to `lf-qa` (lines 3-25) | "lf-qa branch lambda update" | QA | `qa-patient-bill-schedule.zip` | Lambda `$QA_LAMBDA_NAME`, code from S3 bucket `$DEV_LAMBDA_RESOURCE_BUCKET` |
| Push to `lf-uat` (lines 27-49) | "lf-uat branch lambda update" | UAT | `uat-patient-bill-schedule.zip` | Lambda `$UAT_LAMBDA_NAME`, bucket `$DEV_LAMBDA_RESOURCE_BUCKET` |
| Push to `main` (lines 51-73) | "main branch lambda update" | Production | `prod-patient-bill-schedule.zip` | Lambda `$PROD_LAMBDA_NAME`, bucket `$PROD_LAMBDA_RESOURCE_BUCKET` |
| Push to `lf-develop` | none | n/a | n/a | n/a (checked: no `lf-develop` entry, so no automated development deployment from this repo) |
| Pull requests, tags, other branches | none | n/a | n/a | n/a |

Identical step shape for all three (observed):

1. Image `public.ecr.aws/c7j4d3u2/build-agent-image:latest` (unpinned), `size: 1x`, `oidc: true`, `max-time: 15`. Services/Docker not used.
2. Script: `export AWS_REGION=$AWS_REGION`, `export AWS_ROLE_ARN=$AWS_ROLE_ARN` (no-op self-assignments), `echo $BITBUCKET_STEP_OIDC_TOKEN > $(pwd)/web-identity-token`, `export AWS_WEB_IDENTITY_TOKEN_FILE=$(pwd)/web-identity-token`.
3. `rm .gitignore`, `rm bitbucket-pipelines.yml`, `rm -rf .git` (all in the CI clone), then `zip -r <env>-patient-bill-schedule.zip .` from the repository root.
4. `aws s3 cp <zip> s3://<bucket>/<zip>` then `aws lambda update-function-code --function-name <name> --s3-bucket <bucket> --s3-key <zip> --publish`. `--publish` creates a new immutable Lambda version; whether an alias or event source points at `$LATEST` or a version, and how traffic moves, is `unknown`.

Authentication to AWS relies on OIDC (web identity) with `AWS_ROLE_ARN` supplied by Bitbucket variables; the role's permissions are `unknown`.

## Environments and promotion model

Observed mapping: `lf-qa` -> QA Lambda, `lf-uat` -> UAT Lambda, `main` -> production Lambda. QA and UAT share one S3 bucket (`DEV_LAMBDA_RESOURCE_BUCKET`, with per-environment key names); production uses `PROD_LAMBDA_RESOURCE_BUCKET`. Function names, regions, accounts: `unknown`. Promotion is by Git branch merge (no image or artifact promotion): each branch push rebuilds its own zip from that commit, so the production package is not byte-identical to what ran in UAT. How changes flow between branches (per-environment PRs versus `lf-uat` to `main` release merges) is `unknown` here (no history in the snapshot); the sibling repository `rest-api-evoke` uses per-environment branches and `lf-uat` to `main` release PRs, unverified for this repository.

## Release PR flow

Not documented in the repository (`unknown`). Under aisdlc rules the task branch equals the ticket, PRs are created for human review, and merge is human-controlled. Any merge to `lf-qa`, `lf-uat` or `main` immediately deploys code to the corresponding Lambda, with no test, no manual approval and no post-deploy check.

## Versioning and tags

Not determinable: no version file, no changelog, no `setup.py`/`pyproject.toml`, and the snapshot has no tags. The deployed artifacts are identified only by fixed names (`<env>-patient-bill-schedule.zip`, overwritten on each deploy, so the S3 object does not keep prior builds unless bucket versioning is enabled: `unknown`) and by Lambda version numbers created by `--publish`. No mapping from a Lambda version to a commit SHA is recorded by the pipeline (the zip name has no SHA; Lambda version description is not set). Commit convention: `unknown` (no history).

## Rollback

Not documented or automated: `unknown`. Inferred, unverified options: re-point the Lambda alias or event source to a previous published version if aliases are used, or revert on the branch and let the pipeline redeploy. Because the zip key is overwritten, restoring a previous S3 object needs bucket versioning (`unknown`). Rolling back code does not undo database writes already made by the billing run (`src/database/schedule.py` updates patient and task documents and sends SQS messages).

## Manual approvals

None in the repository. Bitbucket deployment permissions, branch restrictions and required approvals are outside the repo: `unknown`.

## Production deploy risk

A push or merge to `main` automatically replaces the production Lambda code with an untested package built from that commit. No lint, tests or smoke invocation precede or follow it, and failures inside the handler are mostly swallowed and logged (`main.py:258-263, 307-308`), so a bad release may not alert until downstream billing data is wrong. The function writes to the production patient/task database and sends bot SQS events, so a defect has data impact beyond redeploy. aisdlc rules: production writes disabled; never push or merge to `lf-qa`, `lf-uat` or `main`, never invoke the function or run `python main.py --patient ...`.

## Findings (safety and CI)

1. Web-identity (OIDC) token is packaged into the deployment artifact (observed placement, outcome inferred). The step writes the OIDC JWT to `$(pwd)/web-identity-token` (lines 14, 38, 62) in the repository root and then runs `zip -r $ZIP_NAME .` from that same directory (lines 21, 45, 69). The script removes `.gitignore`, `bitbucket-pipelines.yml` and `.git` but not `web-identity-token`, so the token file is very likely inside the zip uploaded to S3 and published to Lambda. The token is short-lived and step-scoped, but a credential-bearing file ends up in the bucket and the function package. Verify by listing the archive of an existing artifact before concluding (not done). The same pattern exists in `manufacturer-hl7-parser` and `rest-api-evoke`.
2. The zip contains non-runtime files: `.env-example`, `.vscode/launch-example.json`, and the zip itself may include a stale previous zip if present in the clone (not present in a fresh clone).
3. Dependencies are not installed or bundled by the pipeline; the deployed function's dependency source is unknown and may drift from `requirements.txt`.
4. No tests or lint before automatic production deploy; no PR pipeline.
5. Unpinned build agent image `public.ecr.aws/c7j4d3u2/build-agent-image:latest`.
6. QA and UAT use `DEV_LAMBDA_RESOURCE_BUCKET`, a bucket named for development; no `lf-develop` pipeline exists. A deploy to QA or UAT cannot be told apart from development by bucket alone.
7. The three steps are copy-pasted (about 23 lines each); a packaging fix must be applied three times.
8. The zip name is fixed per environment and overwritten; no immutable, SHA-tagged artifact is retained by the pipeline.
9. Runtime configuration (`src/config.py`): if a `.env` file exists in the working directory it is used, otherwise the code reads `SM_REGION` and `SM_NAME` and fetches the secret from AWS Secrets Manager at import time. A `.env` accidentally packaged into the zip would override Secrets Manager. `.env` is gitignored, so the pipeline clone does not contain it.

## Environment variables and secrets (names only)

Pipeline (Bitbucket variables referenced, values `unknown` and never inspected): `AWS_REGION`, `AWS_ROLE_ARN`, `DEV_LAMBDA_RESOURCE_BUCKET`, `PROD_LAMBDA_RESOURCE_BUCKET`, `QA_LAMBDA_NAME`, `UAT_LAMBDA_NAME`, `PROD_LAMBDA_NAME`; built-in `BITBUCKET_STEP_OIDC_TOKEN` (sensitive); file `web-identity-token` and `AWS_WEB_IDENTITY_TOKEN_FILE` exported in the step.

Lambda runtime (read in `src/config.py`): process environment `SM_REGION`, `SM_NAME`; secret/`.env` keys `DB_URI` (secret), `DATABASE_NAME`, `SLACK_URL` (secret, held as `LF_SLACK_URL`), `EVOKE_SLACK_URL` (secret, optional), `MANUFACTURER_BOT_SQS_URL` (optional). Standard Lambda variables and context are used by the Slack notifier (`context.function_name`, `context.log_stream_name`, `context.log_group_name`, `context.invoked_function_arn`, `src/utils/slack.py`). `.env-example` was not read (access denied), so any further names are `unknown`; no `.env` was opened.

## Observability hooks

Observed: Python `logging` at INFO to the root logger / stdout, which Lambda sends to CloudWatch Logs (`src/utils/logger.py`); per-patient log lines in `main.py`; Slack notification with a CloudWatch log-stream link for per-patient errors collected in `lambda_handler` (`notify_in_slack`, `src/utils/slack.py`, only when `errors` is non-empty; an exception outside the per-patient loop is only logged and sends no Slack message); activity logging events (`src/events/billing_activity_logger.py`, `src/utils/activityLogger.py`; behavior not analyzed here). Not found: metrics, tracing, Lambda alarms, dead-letter queue configuration, health check (checked tracked files; Lambda-side configuration is outside the repo and `unknown`). The Slack call prints the response (`print(requests.post(...))`) and has no timeout.

## Notes for aisdlc

- Task branch equals the ticket. No PR pipeline exists, so nothing runs automatically on a task branch; deployment triggers only on pushes to `lf-qa`, `lf-uat` and `main`, which aisdlc never pushes to.
- Flag any change to packaging (`bitbucket-pipelines.yml`, `requirements.txt`, new top-level files) in the plan: new files are shipped in the zip.
- After release: consolidate into `system/product/` per aisdlc invariants; temporary task artifacts are removed only by the consolidation workflow.
