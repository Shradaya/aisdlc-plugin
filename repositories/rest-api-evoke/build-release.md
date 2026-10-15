---
repository: rest-api-evoke
analyzed_commit: 84768b56f78a3663d6cfb9acf128556c4cdab89f
analyzed_at: 2026-10-15T08:40:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [bitbucket-pipelines.yml, Dockerfile, .dockerignore, package.json, .env.example, util/config.js, routes/index.js, app.js, logger/index.js, sonar-project.properties, .husky/pre-commit, git tags and first-parent history of main, git diff 4178ce4..origin/main --stat on bitbucket-pipelines.yml/Dockerfile/package.json/yarn.lock/.dockerignore/.env.example/sonar-project.properties/.husky (empty: unchanged), app.js:35]
---

# Build and release (Phase H)

Static study only: nothing was built, pushed or deployed. Refresh at 84768b5: `bitbucket-pipelines.yml`, `Dockerfile`, `.dockerignore`, `package.json`, `yarn.lock`, `.env.example`, `sonar-project.properties` and `.husky` are unchanged since 4178ce4 (empty `git diff --stat`), so the Build, Docker, Pipelines, Findings and Rollback sections below were carried over, not re-derived; line references remain valid. Pipeline values (Bitbucket variables, cluster, manifest repository contents) that live outside this repository are `unknown`.

## Build

There is no application build step: plain CommonJS JavaScript, no transpiler, no bundler (`package.json` has no `build` script). The only build is `docker build -f Dockerfile .` run inside the branch pipelines (`bitbucket-pipelines.yml:55-58`, `122-125`, `189-192`, `256-259`). The PR pipeline builds no image.

## Docker image (`Dockerfile`)

- Stage `deps` (`FROM node:24-slim`): copies `package.json` and `yarn.lock`, sets `HUSKY=0` and `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`, runs `yarn install --production --frozen-lockfile && yarn cache clean` (lines 1-11). Dev dependencies (test, lint tools) are not in the image.
- Stage `runtime` (`FROM node:24-slim`): `apt-get update && apt upgrade -y`, installs Debian `chromium`, several font packages and `libxss1`, symlinks `google-chrome-stable`, sets `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` (lines 18-26). Copies `node_modules` from `deps`, then `COPY . .` (lines 29-31), creates `/home/node/Downloads`, chowns to `node`, runs as `USER node`, `CMD ["node", "app.js"]` (lines 33-39).
- Not set: no `EXPOSE`, no `HEALTHCHECK`, no pinned base-image digest (floating `node:24-slim`), and `apt upgrade -y` makes rebuilds of the same commit non-identical (observed; reproducibility impact inferred). The application port comes from `APP_PORT`, defaulting to 3001 in `app.js` per `overview.md`.
- `.dockerignore` excludes `.git`, `.env`, `.env.example`, `docs`, `tests`, `.husky`, lint/format/sonar config, `README.md`, `Dockerfile` and `bitbucket-pipelines.yml`. It does not list `web-identity-token`, `logs/`, `uploads/` or `e2e/` (see Findings).
- Yarn classic is assumed to be present in the base image (inferred from `yarn install` at line 11; not verified).

## Pipelines (`bitbucket-pipelines.yml`)

| Trigger | Steps | Notes |
|---|---|---|
| Pull request, source branch `EL-*` (lines 9-33) | `yarn install` (cache `node`), then in parallel `yarn lint` and `yarn test:ci` (JUnit to `test-results/`) | Image `node:24`. No image build, no coverage, no Sonar. Source branches not matching `EL-*` (for example the `lf-uat` to `main` release PR) get no PR pipeline (inferred from Bitbucket glob behavior) |
| Push to `lf-develop` (lines 36-101) | "Build and Push Docker in lf-develop branch" then "Deploy Dev Backend to EKS" | Bitbucket deployment: `Development`; image tag `dev-<7-char commit SHA>`; manifest overlay `overlays/dev` |
| Push to `lf-qa` (lines 103-168) | Build+push then "Deploy QA Backend to EKS" | Deployment: `Quality Assurance`; tag `qa-<sha>`; overlay `overlays/qa` |
| Push to `lf-uat` (lines 170-235) | Build+push then "Deploy PRE Backend to EKS" | Deployment: `Pre Production`; tag `uat-<sha>`; overlay `overlays/pre-prod` |
| Push to `main` (lines 237-302) | Build+push then "Deploy Production Backend to EKS" | Deployment: `Production`; tag `prod-<sha>`; overlay `overlays/prod` |

Per-branch step details (observed, identical across the four branches):

1. Build step: image `public.ecr.aws/c7j4d3u2/build-agent-image:latest` (unpinned), `size: 2x`, `oidc: true`, `max-time: 15`, `services: [docker]` (Docker service memory 6144, lines 3-6). Script writes `$BITBUCKET_STEP_OIDC_TOKEN` to `$(pwd)/web-identity-token`, exports `AWS_WEB_IDENTITY_TOKEN_FILE`, logs in to ECR (`aws ecr get-login-password ... | docker login`), `docker build -t $BE_ECR_REGISTRY/$BE_IMAGE:<tag> .`, `docker push`.
2. Deploy step: image `public.ecr.aws/c7j4d3u2/deploy-agent-image:latest` (unpinned), `oidc: false`. It base64-decodes `MANIFEST_REPO_SSH_KEY` to `~/.ssh/id_ed25519`, clones `git@bitbucket.org:evoke-medical-care/eks-yml-manifest.git`, uses `yq` to set `.images[] | select(.name == "$BE_ECR_REGISTRY/$BE_IMAGE") | .newTag` in `evoke-app-manifest/emc-portal/overlays/<env>/kustomization.yaml`, commits ("Update <env> rest api image to <tag>") under a hard-coded individual developer git identity (lines 76-77 etc.), and pushes directly to `main` of the manifest repository with up to 3 attempts. On a rebase conflict it runs `git rebase --abort` and `git reset --hard origin/main` inside the CI clone, then re-applies the change (lines 93-100).
3. The deploy step has no `deployment:` key, so the Bitbucket deployment environment is attached only to the build step.
4. No `trigger: manual`, no `pipelines.tags`, `custom` or `default` section, no test, lint, scan or post-deploy health check in any branch pipeline.
5. The actual rollout (Argo CD, Flux or other controller watching the manifest repository) is not described in this repository: `unknown`. The release is considered "requested" when the manifest commit lands.

## Environments and promotion model

Observed mapping: `lf-develop` -> Development (overlay `dev`), `lf-qa` -> Quality Assurance (`qa`), `lf-uat` -> Pre Production (`pre-prod`), `main` -> Production (`prod`). Cluster names, namespaces, hosts and replica counts are `unknown` (live in `eks-yml-manifest`, not inspected). `docs/context/BLUEPRINT.md` describes the same topology.

Observed from `git log --first-parent` (not documented in the repo): promotion is not automatic and is not an image promotion. Each ticket is merged into each environment branch through separate pull requests from per-environment branches, for example EL-5476 appears as PRs #6127 (`EL-5476-qa`), #6128 (`EL-5476-dev`), #6129 and #6130 (`EL-5476`), #6131 (`EL-5476-uat`) on `lf-qa`, `lf-develop` and `lf-uat`. Each environment branch push builds its own image from that branch's commit.

## Release PR flow

Observed: `main` receives (a) release merges "Merged in lf-uat (pull request #NNNN)" roughly every one to three weeks (for example #6195 on 2026-10-14 at the analyzed HEAD, the only first-parent commit since 4178ce4; #6135 on 2026-10-01, #6079 on 2026-09-21, #6073 on 2026-09-18, #6066 on 2026-09-17), and (b) direct merges of `EL-<n>` branches, for example #6098, #6097, #6029, #5999 (hotfix-style, intent `unknown`). The `lf-uat` to `main` PR matches no `EL-*` pull-request pipeline (inferred), so no automated lint or tests gate a release PR. Human review and merge in Bitbucket is assumed (`unknown` whether Bitbucket requires approvals or passing builds). Under aisdlc rules the merge stays human-controlled.

## Versioning and tags

- `package.json` version is `1.0.0` and is not bumped by releases.
- Tags are manual and sporadic: 89 tags; schemes `vNN.NN.NN` (v01 to v08, v10), four `UAT_*` tags and one tag named `list`. Latest `v10.17.00` is an annotated tag on commit `4178ce4` (the previously analyzed commit; at the analyzed HEAD `84768b5` `git describe` = `v10.17.00-40-g84768b56f`, i.e. 40 commits untagged, and no tag points at HEAD; tag count still 89), created 2026-10-01 about 40 minutes after the commit, with message "Disconnected monitors; Max Impedance; Log injection protection". Before it, the previous tag is `v08.08.00` (2025-06-12), so many `lf-uat` merges to `main` between them are untagged (v09 does not exist).
- No pipeline creates or reacts to tags. Deployed artifacts are identified by `<env>-<7-char SHA>` image tags only, so a git tag does not map to a deployed image by itself; the mapping is by commit SHA (inferred). No CHANGELOG file is tracked.
- Commit convention in history (observed): `EL-<n>: <summary>`, plus Bitbucket merge commits "Merged in <branch> (pull request #N)".

## Rollback

Not documented and not automated in this repository: `unknown`. Inferred options (unverified, not tested): revert the `newTag` line for the environment in `eks-yml-manifest` to the previous `prod-<sha>` image, or revert the commit on `main` and let the pipeline build and deploy a new image. Whether old ECR tags are retained or immutable is `unknown`. Note that rolling back the image does not roll back data written by the new version; no database migration framework exists in this repo (`testing.md`).

## Manual approvals

None in the repository: no manual trigger, no deployment-step gate, no tag-based release. Whether Bitbucket Deployments have admin-only permissions or locks configured is `unknown` (settings are outside the repo).

## Production deploy risk

Every push to `main` (including any merge of a PR) automatically builds a new image from that commit and commits the new tag to the production overlay in the manifest repository, with no manual gate in the repo and no tests or scan in that pipeline. The production image is rebuilt from `main`, not promoted from the UAT image, so what runs in production is not byte-identical to what was verified in UAT (floating base image tags, `apt upgrade`, `yarn install` at build time). The deploy step pushes straight to the manifest repository `main` with no review. Branch restrictions on `main` and on the manifest repository are `unknown`. aisdlc rules apply: production writes disabled, merge human-controlled, never push to `main` or tag/release from a task.

## Findings (safety and CI)

1. OIDC token likely baked into every image (observed file placement, inferred outcome). Each build step writes the step OIDC JWT to `$(pwd)/web-identity-token` (lines 52, 119, 186, 253) in the same directory used as the Docker build context (`.`, line 58), `COPY . .` copies the context (`Dockerfile:31`), and `.dockerignore` has no entry for `web-identity-token`. The token is short-lived and step-scoped, but a credential-bearing artifact would be pushed to ECR in a layer. Verify by inspecting an image layer before concluding (not done). The sibling Lambda repository `manufacturer-hl7-parser` has the same pattern.
2. Deploy agent writes a private SSH key (`MANIFEST_REPO_SSH_KEY`) to disk in the CI container; acceptable for an ephemeral CI container, but it grants direct push to the GitOps repository.
3. Deploy steps use `git reset --hard origin/main` in a CI clone (lines 96-97 and equivalents). It is confined to an ephemeral clone in CI; do not copy this pattern into aisdlc, which forbids hard resets.
4. Unpinned build and deploy agent images (`:latest`), floating `node:24` and `node:24-slim`, `apt upgrade` at build time: non-reproducible builds.
5. Branch pipelines never run lint or tests; the PR gate covers only `EL-*` PRs and the `lf-uat` to `main` release PR is not covered (inferred).
6. Hard-coded personal git identity for manifest commits; commits in the manifest repository are attributed to one named developer.
7. `sonar-project.properties` is present but no pipeline step runs a scanner; where analysis runs is `unknown`.
8. Pipelines duplicate about 65 lines four times; a change to deploy logic must be applied to all four branches.

## Environment variables and secrets (names only)

Pipeline/Bitbucket variables referenced: `AWS_REGION`, `AWS_ROLE_ARN`, `BE_ECR_REGISTRY`, `BE_IMAGE`, `MANIFEST_REPO_SSH_KEY` (secret), and Bitbucket built-ins `BITBUCKET_COMMIT`, `BITBUCKET_STEP_OIDC_TOKEN`. Where the values are defined (repository or deployment variables) is `unknown`; no value was inspected.

Application runtime variables read in tracked non-test code (`git grep process.env`; values supplied through the manifest repository or cluster, `unknown`): `NODE_ENV`, `APP_PORT`, `APP_ENVIRONMENT`, `ALLOWED_ORIGINS`, `CLIENT_URL`, `CSP_REPORT_ONLY`, `CSP_REPORT_URI`, `JWT_SECRET`, `JWT_EXPIRATION_TIME`, `CRYPTO_SECRET`, `WEBHOOK_SECRET`, `MONGO_DB_TIME_OUT`, `EVOKE_AUTOMATED_NOTES_USER`, `COVER_PAGE_PATH`, `PATIENT_CONNECTIVITY_REPORT_PATH`, `PASS_MAIL_SENDER`, `OTP_MAIL_SENDER`, `NOREPLY_MAIL_SENDER`, `POST_GRID_BASE_API`, `POST_GRID_PRINT_MAIL_API_KEY`, `POST_GRID_ADDRESS_VERIFICATION_API_KEY`, `POST_GRID_SENDER_CONTACT_ID`, `PUPPETEER_EXECUTABLE_PATH`, `LOCAL_CHROME_PATH`, `AWS_REGION`, `AWS_SECRET_ARN`, `AWS_BOT_SECRET_ARN`, `AWS_S3_BUCKET`, `AWS_SES_REGION`, `AWS_SES_ACCESS_KEY`, `AWS_SES_SECRET_KEY`, `AWS_LAMBDA_REGION`, `AWS_LAMBDA_FUNCTION_NAME_TWILIO`, `AWS_LAMBDA_FUNCTION_NAME_BOT`, `AWS_SNS_HL7JOB_TOPIC_ARN`, `AWS_SNS_HL7JOB_TOPIC_REGION`, `AWS_SFTP_QUEUE_URL`, `AWS_INTERGY_QUEUE_URL`, `AWS_CARDIO_ONE_QUEUE_URL`, `AWS_BOT_QUEUE_URL`, `AWS_BENCHMARK_QUEUE_URL`, `AWS_ALERT_NOTIFICATION_QUEUE_URL`. Further secrets are fetched at runtime from AWS Secrets Manager by ARN (`AWS_SECRET_ARN`, `AWS_BOT_SECRET_ARN`; `util/v2/secret_manager/secretValue.js`). The checked-in `.env.example` lists only 18 names (`MONGO_DB_HOST`, `JWT_SECRET`, `EVOKE_AUTOMATED_NOTES_USER`, `JWT_EXPIRATION_TIME`, `SG_MAIL_TOKEN`, `SG_MAIL_SENDER_EMAIL`, `MONGO_DB_TIME_OUT`, `COVER_PAGE_PATH`, `BUCKET`, `REGION`, `NODE_ENV`, `PASS_MAIL_SENDER`, `CLIENT_URL`, `CRYPTO_SECRET`, `ALLOWED_ORIGINS`, `CSP_REPORT_ONLY`, `CSP_REPORT_URI`, `AWS_CARDIO_ONE_QUEUE_URL`), so it is stale relative to the code; `MONGO_DB_HOST`, `SG_MAIL_TOKEN`, `SG_MAIL_SENDER_EMAIL`, `BUCKET` and `REGION` have no reader in tracked non-test code (static grep). No `.env` was opened.

## Observability hooks

Observed: `winston` logger with Console and file transport `logs/error.log` (`logger/index.js`; the file is on the container filesystem, so durability is `unknown` and likely ephemeral), `morgan` request logging (`app.js:32`), per-request activity/audit middleware (`middleware/activityLogger.js`, `middleware/v2/userActivityLogger.js`; behavior not analyzed here), CSP violation report endpoint configured by `CSP_REPORT_URI`, and `GET /health-check` returning `OK` unconditionally with no database or dependency check (`routes/index.js:69-71`). New since the last analysis: the morgan access log skips `/health-check` requests (`app.js:35`). Not found: APM, Sentry, Prometheus/OpenTelemetry metrics, CloudWatch hooks, `HEALTHCHECK` (grep in tracked non-test, non-lock files). Log shipping, alerting and probe configuration (liveness/readiness) live in the manifest repository or cluster: `unknown`.

## Notes for aisdlc

- Task branch equals the ticket (`EL-<n>`), which matches the PR pipeline pattern `EL-*`; aisdlc never pushes to `lf-*` or `main`, so no branch pipeline can deploy as a side effect of aisdlc work.
- Human-controlled steps after PR: choose target environment branch(es) per team practice (`unknown` whether `lf-develop` is the default PR target), merge, later the `lf-uat` to `main` release PR, then tag (manual). Production deploy happens as a consequence of merging to `main`.
- After release, consolidation into `system/product/` per aisdlc invariants; temporary task artifacts are removed only by the consolidation workflow.
