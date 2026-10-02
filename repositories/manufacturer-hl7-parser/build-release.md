---
repository: manufacturer-hl7-parser
analyzed_commit: e185ff36fe03c649cd7e9750e895c8c43f857c43
analyzed_at: 2026-10-01T17:37:23Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [bitbucket-pipelines.yml, requirements.txt]
---

# Build and release (Phase H)

## Build

There is no build or install step. Each branch step runs `rm .gitignore`, `rm bitbucket-pipelines.yml`, `rm -rf .git`, then `zip -r <env>-hl7-parser.zip . -x "tests/*"`. The zip therefore contains source, `requirements.txt`, readme, `.env-example`, `.vscode/launch-example.json`, and the `web-identity-token` file written earlier in the step (see `security.md`). Dependencies are not packaged, so they come from a Lambda layer or runtime (`unknown`). Python runtime and handler config are `unknown`; the code defines `main.lambda_handler`.

## Pipeline per branch

Image `public.ecr.aws/c7j4d3u2/build-agent-image:latest` (unpinned), `oidc: true`, `max-time: 15`, size 1x. No `trigger: manual`: every push deploys.

| Branch | Bitbucket deployment | Zip | Bucket variable | Lambda variable(s) |
|---|---|---|---|---|
| `lf-develop` | Development | `dev-hl7-parser.zip` | `DEV_LAMBDA_RESOURCE_BUCKET` | `DEV_LAMBDA_NAME` |
| `lf-qa` | Quality Assurance | `qa-hl7-parser.zip` | `DEV_LAMBDA_RESOURCE_BUCKET` | `QA_LAMBDA_NAME` |
| `lf-uat` | Pre Production | `uat-hl7-parser.zip` | `DEV_LAMBDA_RESOURCE_BUCKET` | `UAT_LAMBDA_NAME` |
| `main` | Production | `prod-hl7-parser.zip` | `PROD_LAMBDA_RESOURCE_BUCKET` | `ABBOT_LAMBDA_NAME`, `BOSTON_LAMBDA_NAME`, `MDT_LAMBDA_NAME`, `BIOT_LAMBDA_NAME` |

QA and UAT use the Dev bucket variable (observed; intent `unknown`). Variable names used: `AWS_REGION`, `AWS_ROLE_ARN`, `BITBUCKET_STEP_OIDC_TOKEN`. Where values are defined (Bitbucket deployment/repository variables) is `unknown`.

## Release and rollback

Release is `aws s3 cp` then `aws lambda update-function-code --s3-bucket --s3-key --publish`; `--publish` creates a numbered Lambda version. No alias, traffic shifting, approval gate, smoke test or post-deploy check exists in the repo. Rollback is `unknown` (nothing evidenced). The S3 key is overwritten per environment; S3 versioning is `unknown`.

## Branch model (observed from the pipeline file only)

`main` deploys to Production; `lf-develop`, `lf-qa`, `lf-uat` are environment branches. No pipeline runs on feature branches, PRs or tags. Merging to `main` therefore deploys to four production Lambdas with no CI tests and no manual gate in the repo; any Bitbucket-side protections are `unknown`. Under aisdlc rules, merge stays human-controlled and task branches use the ticket number only.
