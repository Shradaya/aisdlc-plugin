---
repository: client-emr-hl7-parser
analyzed_commit: 542997c1b6c48c4e410090b6d49e92e02cd5c8ba
analyzed_branch: main
analyzed_at: 2026-10-15T08:46:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [bitbucket-pipelines.yml, git log of bitbucket-pipelines.yml, requirements.txt, main.py, readme.md, .gitignore, git tree of origin/lf-develop]
---

# Build and Release

Source: `${AISDLC_REPOS_ROOT}/client-emr-hl7-parser`, static read only. Nothing was run. Infrastructure (Lambda config, IAM role, buckets) is outside the repo: `unknown` unless stated.

## Build

- No build step. There is no compile, packaging config, `pip install`, Dockerfile or vendoring step in the repo or pipeline. The artifact is a zip of the repository checkout.
- Dependencies from `requirements.txt` (19 pins, including `pymupdf`, `hl7apy`, `Levenshtein`, `RapidFuzz`) are not installed into the zip by the pipeline. How they reach the Lambda (layer, container, preinstalled) is `unknown`; native packages (`pymupdf`, `Levenshtein`, `RapidFuzz`) suggest a layer built elsewhere (inferred, unverified).
- Python runtime version: `unknown`.

## Pipeline (`bitbucket-pipelines.yml`, observed)

Branch pipelines only, one step each; no `pull-requests`, `default`, `tags` or `custom`; no test, lint or scan step; no manual approval trigger.

| Branch | Step | Deployment env | Zip | S3 bucket variable | Lambda variable |
|---|---|---|---|---|---|
| `lf-uat` | "lf-uat branch lambda update" | User Acceptance Testing | `uat-client-emr.zip` | `DEV_LAMBDA_RESOURCE_BUCKET` | `UAT_LAMBDA_NAME` |
| `main` | "main branch lambda update" | Production | `prod-client-emr.zip` | `PROD_LAMBDA_RESOURCE_BUCKET` | `PROD_LAMBDA_NAME` |

There is no `lf-qa` or `lf-develop` pipeline on this commit. (`origin/lf-develop` holds a separate, older pipeline file using self-hosted runners; not analyzed in depth.)

Each step: image `public.ecr.aws/c7j4d3u2/build-agent-image:latest` (floating tag), `size: 1x`, `max-time: 15`, `oidc: true`. Script: export `AWS_REGION` and `AWS_ROLE_ARN`, write `$BITBUCKET_STEP_OIDC_TOKEN` to `./web-identity-token` and set `AWS_WEB_IDENTITY_TOKEN_FILE`; `rm .gitignore`, `rm bitbucket-pipelines.yml`, `rm -rf .git`; `zip -r <zip> .`; `aws s3 cp` to the bucket; `aws lambda update-function-code --function-name <name> --s3-bucket <bucket> --s3-key <zip> --publish`.

Findings:
- The OIDC token file `web-identity-token` is created in the working directory before `zip -r $ZIP_NAME .`, so it is included in the deployment package (observed from the script order). It is a short-lived credential but should not ship; do not record its value.
- The UAT zip is uploaded to the "DEV" bucket variable (`DEV_LAMBDA_RESOURCE_BUCKET`); whether that bucket is shared with another environment is `unknown`.
- Everything tracked ships in the zip: `readme.md`, `.vscode/launch-example.json`, `.env-example`, `src/utils/testPDF.pdf`, and any future `tests/`.
- `--publish` creates a new Lambda version; whether an alias or trigger points at `$LATEST` or a version is `unknown`. No post-deploy check, no rollback step.
- The `.gitignore` is deleted in CI, so untracked files are not an issue in a clean clone, but a local `.env` is never in the zip (not tracked).

## Release flow

- Branch model: task branch named as the ticket (for example `EL-5353`), merged by a human through Bitbucket pull requests into `main` (history shows "Merged in EL-5304 (pull request #366)"). Environment branches: `lf-uat` (UAT deploy), `main` (production deploy). Many `<ticket>-uat` branches exist (for example `EL-4404-uat`), suggesting changes are promoted to `lf-uat` through ticket-specific UAT branches (inferred from names only; the actual procedure is `unknown`).
- Merge to `main` auto-deploys production with no gate in the repo. Branch restrictions and required approvals live in Bitbucket settings: `unknown`.
- Versioning/tags/changelog: none tracked; the `version` remote branch exists but its purpose is `unknown`. Release notes: none.
- Rollback: not defined in repo. Mechanically, repoint the Lambda to a prior published version or redeploy a prior commit (inferred from `--publish`; unverified).

## Environments and configuration

Environment names: UAT (`lf-uat`), Production (`main`). Configuration is injected via Bitbucket deployment variables (names only: `AWS_REGION`, `AWS_ROLE_ARN`, `DEV_LAMBDA_RESOURCE_BUCKET`, `PROD_LAMBDA_RESOURCE_BUCKET`, `UAT_LAMBDA_NAME`, `PROD_LAMBDA_NAME`) and Lambda environment variables plus Secrets Manager (names in `testing.md`). Values are not recorded.

## Constraints for aisdlc

- No aisdlc task may push, merge to or trigger `lf-uat` or `main`; those deploy real Lambdas. Production writes stay disabled.
- Pipeline file changes need a plan, explicit human approval, and a statement of impact on both environments; they cannot be tested before merge (no PR pipeline).
- Because the zip contains the whole tree, new files (tests, docs, samples) ship to the Lambda; plan exclusions if adding any.

## Unknowns

Lambda runtime, memory, timeout, layers, triggers, aliases; how dependencies are provided; branch restrictions; QA environment existence; purpose of `version`/`sonar` branches; promotion procedure for `-uat` branches; rollback practice.
