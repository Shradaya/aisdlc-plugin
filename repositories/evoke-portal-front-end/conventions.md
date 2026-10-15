---
repository: evoke-portal-front-end
analyzed_commit: 35b36e323291354f6cb8fe43162c8f0dec9a1478
analyzed_branch: main
analyzed_at: 2026-10-15T08:45:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [.prettierrc, .eslintrc.json, .husky/pre-commit, package.json, jsconfig.json, src/, git log main, src/utils/auth.js, src/app/store/accountDocument/api/accountDocumentApi.js, src/components/common/accountDocument/AccountDocumentLink.js, src/static/account_document.js, src/hooks/useCloseModalPage.js]
---

# evoke-portal-front-end: Conventions (Phase J)

## Style (observed)

JavaScript only. Prettier: 2-space indent, double quotes, semicolons, `trailingComma: es5`. ESLint 8 (`react-app`, `react-app/jest`, `eslint:recommended`, `prettier`): `eqeqeq` error, `no-console` warn (allows warn and error), `no-unused-vars` warn, `import/no-commonjs` error, `react-hooks/exhaustive-deps` off. Husky pre-commit runs lint-staged (`eslint --fix`, `prettier --write`). The Docker build disables lint (`DISABLE_ESLINT_PLUGIN=true`, `HUSKY=0`).

## Imports and naming (observed)

`jsconfig.json` `baseUrl: ./src`: about 2,251 absolute-style imports vs 80 relative. File naming: PascalCase components (465 files), camelCase (302), `use*` hooks (137), dotted names such as `x.util.js` (22). Hooks sit beside their component.

## Patterns (observed)

New RTK Query domains follow the same shape (EL-5597 `accountDocument`: constants in `static/account_document.js`, `app/services/accountDocument`, `app/store/accountDocument/api`, shared component in `components/common/accountDocument`). Reusable MUI helpers sit under `components/common/<name>/` (`ExpandableTags`, JSDoc with `@param`). Pages that show only a modal leave through `hooks/useCloseModalPage`. Per-domain store under `app/store/<domain>/` (`slice/`, `actions/` reducer maps, `api/` RTK Query with `queryFn`, `slice/state/`); services in `app/services/<domain>/` calling `app/lib/api.js`; endpoints in `src/static/endpoints.js` with `:param` interpolation; constants in `src/static/constants.js`; yup schemas in `src/schemas`; toasts via `utils/toast.js`. Legacy classic-Redux code coexists.

## Styling (observed)

MUI 5 `sx` (133 files), `@mui/styles` (28), 78 `.css` files, `clsx`, theme in `src/evokeTheme.js`.

## Tests

None (see `testing.md`).

## Git (observed, read-only `git log main`)

Environment branches `lf-develop`, `lf-qa`, `lf-uat`, `main` (each deploys). Ticket branches `EL-<n>`, with suffixed variants seen (`EL-5354-uat`, `EL-5409-uat`), which conflict with the aisdlc rule that the branch equals the ticket number; aisdlc branches must be exactly `EL-<n>` and never `lf-*`. Commit subjects `EL-<n>: <summary>` (about 1,539); Bitbucket merges `Merged in <branch> (pull request #N)`; older prefixes `EPFE`, `EMR`.
