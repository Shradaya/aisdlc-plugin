---
repository: evoke-portal-front-end
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_branch: main
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [Dockerfile, nginx.conf, craco.config.js, bitbucket-pipelines.yml, package.json, git log main, git tag]
---

# evoke-portal-front-end: Build and release (Phase H)

## Build (observed)

`yarn build` runs `craco build`. `craco.config.js` adds a build timestamp to production JS and CSS file names and disables source maps. `Dockerfile`: stage 1 `node:20-slim` with `COPY . .` then `yarn && yarn build` (not `--frozen-lockfile`; `moment-timezone` is declared but missing from `yarn.lock`, so it resolves at build time); stage 2 `nginx:1.22` serving `build/` on port 8080 as the non-root `nginx` user. `ENV HUSKY=0`, `DISABLE_ESLINT_PLUGIN=true`.

## Environment injection (observed)

`REACT_APP_BASE_URL`, `REACT_APP_SOCKET_SERVER_URL`, `REACT_APP_ENV` are build args baked into the bundle; each environment is rebuilt, not promoted. The `lf-develop` and `lf-qa` builds do not pass `REACT_APP_SOCKET_SERVER_URL` (effect `unknown`; sockets are enabled only for `prod` and `pre` anyway).

## Pipeline (observed, `bitbucket-pipelines.yml`)

Branch pipelines only:

| Branch | Deployment | Image tag | Overlay in `eks-yml-manifest` |
|---|---|---|---|
| `lf-develop` | Development | `dev-<sha7>` | `dev` |
| `lf-qa` | Quality Assurance | `qa-<sha7>` | `qa` |
| `lf-uat` | Pre Production | `uat-<sha7>` | `pre-prod` |
| `main` | Production | `prod-<sha7>` | `prod` |

Step 1 builds and pushes the image to ECR using a Bitbucket OIDC role (`AWS_ROLE_ARN`). Step 2 clones `git@bitbucket.org:evoke-medical-care/eks-yml-manifest.git` (SSH key from `MANIFEST_REPO_SSH_KEY`), rewrites `newTag` with `yq` in `evoke-app-manifest/emc-portal/overlays/<env>/kustomization.yaml`, commits `chore: update <env> frontend image to <tag>` and pushes to that repository's `main` with 3 retries (rebase between). Agent images use floating `:latest` tags. A named individual is hard-coded as committer (not recorded here). `eks-yml-manifest` is not a registered repository.

## What the pipeline does not do (observed)

No lint, test, audit or Sonar step; no pull-request pipeline; no `trigger: manual` or approval step for any environment. **Finding (high confidence):** every push or merge to `main` deploys to Production. Bitbucket-side protections are `unknown`. This conflicts with the aisdlc default that production writes are disabled, so merges to `main` must remain human-controlled.

The `web-identity-token` file written by the pipeline is inside the Docker build context (`COPY . .`; `.dockerignore` does not exclude it); it does not reach the final nginx image (inferred low risk).

## nginx (observed)

SPA fallback (`try_files`), HSTS, `X-Frame-Options`, `nosniff`, CSP (see `security.md`); no gzip or cache config; no health endpoint (only `/50x.html`).

## Versioning and branch model (observed)

The release unit is the image tag `<env>-<sha7>`; `package.json` version `0.1.0` is stale. 90 git tags exist (latest `v08.07.00`, also `UAT_vN.NN.NN`); none are created by the pipeline. About 9,465 commits on `main`, mostly `Merged in <branch> (pull request #n)`. `lf-uat` is promoted to `main` by PR; some ticket branches (e.g. EL-5486) also merge directly into `main`. Ticket branches are `EL-<n>` with suffixed variants.

## Hooks

Husky 8 pre-commit runs lint-staged only; not active in Docker (`HUSKY=0`).

## Unknowns

Rollback procedure (reverting the overlay commit or re-running an earlier pipeline is an unverified possibility); GitOps controller, sync policy and rollout health checks; ECR retention; Bitbucket branch restrictions and deployment approvals; where pipeline variable values are defined; tag-cutting rules; where Sonar runs.
