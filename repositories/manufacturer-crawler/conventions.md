---
repository: manufacturer-crawler
analyzed_commit: d6aa388a03c12e777846a704818ba5903a021a4f
analyzed_branch: main
analyzed_at: 2026-10-15T08:55:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [README.md, main.py, constants.py, manufacturer/__init__.py, database/__init__.py, utils/__init__.py, utils/slack.py, utils/response.py, utils/logger.py, eventHandler/event_schema.py, database/*.py, bitbucket-pipelines.yml, sonar-project.properties, .dockerignore, .gitignore, grep counts over the snapshot]
---

# manufacturer-crawler: Conventions (Phase J)

## Code style

- Formatter: README says use `black` (`black .`); no config file (`pyproject.toml`, `setup.cfg`) and no CI check enforces it. Formatting is mostly black-like but not uniform (some files have non-black spacing, for example `database/db_secret.py`, `utils/secretString.py`; observed).
- Naming is mixed: both styles are common: grep of unindented `def` lines finds 93 snake_case names (`^def [a-z_]+\(`) and 82 camelCase names (`^def [a-z]+[A-Z]`, for example `fetchPatient`, `setConnection`, `activeAccounts`); module file names mix styles (`getPatient.py`, `noShowRecord.py`, `trackAlert.py` vs `search_patient.py`); manufacturer folders are `Title_Case` (`Abbott_Merlin`); constants are `UPPER_SNAKE` in `constants.py` but some module constants are camelCase (`userDataDir`, `eventType`, `timezoneMapping`).
- Helper dictionary access via `dotdict` (`constants.FORMAT.ERROR_MSG`, `SECRET.SLACK_URL`): attribute access returns `None` for missing keys instead of raising (`dotdict.__getattr__ = dict.get`), so a missing secret key silently yields `None` (observed in `utils/secretString.py`).

## Structure and imports

- Top-level package imports (`import constants`, `from utils import ...`, `from database import ...`); the re-exporting `__init__.py` files (`database/__init__.py`, `utils/__init__.py`, `manufacturer/__init__.py`) define the public surface. New helpers must be exported there to be importable as `from database import ...`.
- One crawler package per manufacturer with a fixed shape (login/entry module named after the portal, `patient_crawler.py`, `transmission_crawler.py`, `disconnected_monitors*.py`, `utils.py`, `common.py`); the entry function returns an ack dict.
- Event handlers are imported lazily inside `process_event` (`from eventHandler import ..._event_handler`).
- Handlers return either an ack dict (`utils/response.py`: `setError` -> `{status: 202, message}`, `setSuccess` -> `{status: 200, message}`) or a list of documents to crawl; "error" acks use HTTP-like 202, not 4xx/5xx (observed).

## Error handling and logging

- Pattern: wrap in `try/except Exception as e`, build `errorMsg`, `logging.error(errorMsg)`, call `send_slack_msg(f"{errorMsg}:{e}", constants.FORMAT.ERROR_MSG_WITH_EXCEPTION)`, and return `None` or False (all `database/*.py` helpers). Failure is therefore reported through Slack, not raised; callers must tolerate `None`.
- Slack message format is part of the code contract: `send_slack_msg` splits on `":"` for some formats (`generateErrorMsgWithException`, `generateNotificationMsgWithNumberedList`, `generateBlock`), so a message that contains extra colons or no colon can be truncated or raise (`utils/slack.py`; the numbered-list format uses `ast.literal_eval` on the text after the colon). Keep the `"<title>:<detail>"` shape.
- Error vs info routing: formats whose name contains "error" go to the error webhook (`get_slack_url`); other messages go to the channel chosen by `update_config(event_type)`.
- Logging: standard `logging` configured in `utils/logger.py` (stdout, level from `LOG_LEVEL`, default INFO); 5 bare `print` calls remain (`main.py`, `utils/slack.py`).
- Bare `except:` appears 54 times (grep), commonly around Selenium lookups and driver shutdown (for example `main.py` `driver.quit()`), which hides unexpected errors.
- Selenium: explicit waits are used widely (about 130 `WebDriverWait` or `_wait_with_context` occurrences), plus 24 `time.sleep` calls (grep). Element locators are XPath/ID strings embedded in the crawler modules (portal UI changes require code edits in the affected manufacturer package).
- Failure screenshot: `driver.save_screenshot("/tmp/snapshot.png")` before `send_slack_msg(..., *_WITH_SNAPSHOT)` (repeated across Abbott, Biotronik and others).

## Data and dates

- Date handling goes through `utils/dates.py` (`get_utc_now`, `calculateNextSend`, `compareDates`); dates exchanged with portals are strings in `%d-%b-%Y` (`get_year_month_day`), while MongoDB gets datetimes (UTC). Both forms exist in stored status logs (see `data-model.md`).
- Timezones: `constants.timezoneMapping` maps account names to IANA zones; new Biotronik accounts need an entry or they are "pending" (`utils/reportStatus.py` `get_biotronik_patients`: accounts without a timezone are reported as requiring release). `constants.ACCOUNT_MAPPING` maps display names to codes.
- Database helpers return lists and counts (`fetchReports`, `fetchDocument` return `(list, len)`), while `fetchPatient` returns a cursor, a single document or `None` depending on `amount`.

## Event and payload conventions

- Every event has `eventType` (values in `constants.eventType`); new event types need a pydantic model in `eventHandler/event_schema.py` and a branch in `main.process_event`.
- Eligibility filter repeated in each handler: patients with `information.in_office_only` false or missing (`$or` clause in `bot_trigger.py`, `bot_triggers.py`, `recrawl.py`, `main.py`, `cron_job.py`).
- Recrawl skips known permanent failures listed in `constants.RECRAWL_IGNORE_REASONS`; adding a new "expected" failure message there prevents repeated retries. `REPROCESS_REASON` strings force SQS retry for disconnected monitors.

## Testing and quality

- No automated tests, no test framework or dev requirements file (checked file list). `eventHandler/test_report.py` is a production handler.
- SonarCloud is configured by `sonar-project.properties` (`sonar.sources=.`); no pipeline step runs it (the pipeline only builds and deploys).
- Static typing is minimal (a few annotations in `main.py` and `utils/helpers.py`).

## Delivery conventions

- Branch and merges: history shows Bitbucket pull-request merge commits ("Merged in patch (pull request #205)"). The pipeline runs only on `main` pushes and deploys immediately (`bitbucket-pipelines.yml`), so a merge to `main` is a production deployment (observed).
- Commit message convention in the repository history: not examined beyond the HEAD subject. Workspace rule `<ticket>: <summary>` applies to aisdlc tasks regardless.
- Docker image: `latest` tag only; no versioning or rollback tag (`bitbucket-pipelines.yml`).
- Configuration: AWS Secrets Manager plus a few env vars (names in `security.md`); local runs use `LOCAL_EXECUTION` and env exports in the virtualenv activate script (README).

## Unknowns

- Commit message and branch naming practice of the team: not derivable from the snapshot (single HEAD subject only).
- Whether `black` is applied in review: no evidence of enforcement.
