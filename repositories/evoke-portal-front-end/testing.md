---
repository: evoke-portal-front-end
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_branch: main
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [package.json, .eslintrc.json, .husky/pre-commit, sonar-project.properties, bitbucket-pipelines.yml, Dockerfile, find for test/spec files on the main snapshot]
---

# evoke-portal-front-end: Testing profile (Phase G)

Static analysis only; no tests were run and no dependencies installed.

## Frameworks

None declared. `package.json` has `"test": "craco test"` but no jest config, no `src/setupTests.js`, and no testing-library, msw, cypress or playwright dependency. `.eslintrc.json` extends `react-app/jest`. History: the CRA default `src/App.test.js` was added (69074d075) and removed (e5ddaa385); no other test file was ever added on `main`. Any test harness outside the repository is `unknown` (not looked for).

## Test Layers

| Layer | Framework | Command | Scope | Prerequisites | CI stage | Required for merge | Typical runtime | Test data strategy | Known failures/flakiness |
|---|---|---|---|---|---|---|---|---|---|
| unit | none | `yarn test` (no tests) | n/a | n/a | none | no | unknown | n/a | none known |
| integration | none | none | n/a | n/a | none | no | unknown | n/a | n/a |
| contract | none | none | n/a (API contract is `rest-api-evoke`) | n/a | none | no | unknown | n/a | n/a |
| API | none | none | n/a | n/a | none | no | unknown | n/a | n/a |
| component | none | none | n/a | n/a | none | no | unknown | n/a | n/a |
| end-to-end | none in repo | none | n/a | n/a | none | no | unknown | n/a | n/a |
| data-quality | not applicable | n/a | no database | n/a | n/a | n/a | n/a | n/a | n/a |
| migration | not applicable | n/a | no database | n/a | n/a | n/a | n/a | n/a | n/a |
| performance | none | none | n/a | n/a | none | no | unknown | n/a | n/a |
| security | none | none (no audit or SAST step) | n/a | n/a | none | no | unknown | n/a | n/a |
| smoke | none | none | n/a | n/a | none | no | unknown | n/a | n/a |

## Commands

`yarn lint` (`eslint .`), `yarn lint:fix`, `yarn format` (`prettier --write .`), `yarn build` (`craco build`), `yarn test` (`craco test`; whether it starts is `unknown` because `craco.config.js` uses ESM `import/export` without `"type": "module"`).

## Test Data

unknown (no tests).

## Fixtures and Mocks

None found.

## Environment Requirements

Node (Dockerfile uses `node:20-slim`; no `.nvmrc`, no `engines`); Yarn. Env vars by name: `REACT_APP_BASE_URL`, `REACT_APP_SOCKET_SERVER_URL`, `REACT_APP_ENV`.

## Database / Infrastructure Requirements

None for the SPA itself. Manual verification needs a reachable backend (`rest-api-evoke`) and, for realtime features, the socket service (enabled only when `REACT_APP_ENV` is `prod` or `pre`).

## Coverage

None configured or measured (0% inferred from absent tests). `sonar-project.properties` has only a project key and `sonar.sources=.`; where Sonar runs is `unknown`.

## CI Integration

`bitbucket-pipelines.yml` has branch pipelines only (`lf-develop`, `lf-qa`, `lf-uat`, `main`), each build-and-deploy. No lint, test, audit or Sonar step, no pull-request pipeline. The Docker build sets `DISABLE_ESLINT_PLUGIN=true`.

## Required Pre-merge Checks

None enforced in the repository. Local only: Husky pre-commit lint-staged (ESLint fix and Prettier). Bitbucket-side branch restrictions and required reviewers are `unknown`.

## Regression Strategy

None automated. Recommendation (policy, not observed): bugs need a regression test or a recorded waiver; with no test framework, the waiver and manual evidence (Development, QA or UAT, never Production) are the default until a framework is added.

## Flaky / Quarantined Tests

None (no tests).

## Known Gaps

No test framework or tests; no CI quality gate; no coverage; no E2E; production deploys on every push to `main` with no gate; `craco test` viability unknown; README says npm while the repo uses Yarn.

## Feature Test Decision Rules

1. Always run `yarn lint` and `yarn build` and keep Prettier formatting.
2. Pure logic in `src/utils`, `src/schemas` and reducers: add Jest unit tests (framework must be added; record the addition in the plan).
3. Complex components or forms: React Testing Library component tests once the harness exists.
4. Cross-page or role-dependent flows: end-to-end test or documented manual walk-through per role listed in the route table (`architecture.md`).
5. Changes to `nginx.conf` or CSP, auth, role gating or token handling are security-sensitive: require plan approval and a reviewer.
6. API contract changes in `rest-api-evoke`: check every screen in `interfaces.md` that reads the changed fields.
7. Any mandatory layer that cannot run needs a recorded waiver.
