---
repository: client-emr-hl7-parser
analyzed_commit: b9615126ee17c4e2583e08ac81faaa9d12c63005
analyzed_at: 2026-10-09T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [main.py, src/config.py, src/eventHandler/, src/accountHandler/__init__.py, src/database/query.py, src/database/connection.py, src/utils/logger.py, src/utils/slack.py, bitbucket-pipelines.yml, readme.md, git log]
---

# client-emr-hl7-parser: Conventions

## Code style (observed)

- Python, PEP 8 style indentation (4 spaces); no formatter, linter, type-checker or `pyproject`/`setup.cfg`/`.flake8` config in the repo (`git ls-files`). Style is mixed: newer modules (`idco_oru.py`, `query.py`) use type hints and docstrings; older ones do not.
- Typo-named modules are established and must be imported as is: `src/eventHandler/contants.py`, `hl7/creator/contants.py`, constant `SQUENCERS_COLLECTION`.
- Comments use the `# # #` marker style (`# # # MAP CLINIC NAME`, `src/eventHandler/adt.py`).
- Local `hl7/` package shadows the PyPI name `hl7`; imports of `hl7.parser`, `hl7.creator` refer to the in-repo package, parser errors come from `hl7apy` re-exported via `hl7/__init__.py`.

## Patterns

- Event handlers take `(event, response)` and return `response`; they set `response['error']` / `response['message']` / `response['notify']` instead of raising, with `except ParserError: pass` and a generic `except Exception` that stores the error and prints the traceback (`src/eventHandler/*.py`).
- Per-client behaviour is isolated in `src/accountHandler/<account>/` and wired through dict mappers keyed by facility name in `src/accountHandler/__init__.py`; optional account hooks are looked up with `call_func_if_available(account_util, 'get_clinic_settings')` / `hasattr(account_util, 'generate_content_for_base64')`.
- DB access only through the `Mongo` singleton and functions in `src/database/query.py`; collection names are constants in `src/utils/constants.py`; payload builders live in `query_utils.py`.
- Response contract: status 200 on success, 202 on error (`main.py`).
- Config via `ENV_VARS` dotdict; local mode when a `.env` file exists (disables Slack posts).
- Logging: root logger `log` from `src/utils/logger.py`, format `[%(levelname)s] %(asctime)s %(module)s:%(funcName)s - %(message)s`; mostly `log.info`, with some `print`.
- Naming: functions and variables `snake_case`; mixed-case folder `eventHandler`/`accountHandler`; module-level private functions prefixed `__` in `query.py`.

## Testing

No tests, test runner or CI test step found (`git grep "pytest|unittest|def test_"` empty; pipeline has no test step). Manual run via CLI `python main.py --eventType ... --value ...` and `.vscode/launch-example.json`.

## Git and branches

- Branches observed: `main` (production deploy), `lf-uat` (UAT deploy) per `bitbucket-pipelines.yml`; work branch `EL-5353` equals the ticket key.
- Commit messages in history: `EL-5353: Add Baptist Heart & Vascular Electrophysiology to Tenet mapper`; Bitbucket merge commits `Merged in EL-5304 (pull request #366)`; some untagged ones (`Update the pipeline base image`). Ticket-prefixed form `<TICKET>: <summary>` matches the workspace rule (inferred convention, not universal in history).
- Pull requests merged via Bitbucket (`Merged in ... (pull request #N)`).

## Docs

`readme.md` is brief and partly stale (no `accountHandler`, typo `requiremnts.txt`, describes `python main.lambda_handler`). No ADRs, CHANGELOG or contributing guide found.

## Unknowns

- Python version target, lint/format expectations, review requirements (checked repo root, pipeline).
