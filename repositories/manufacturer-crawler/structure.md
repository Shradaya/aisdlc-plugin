---
repository: manufacturer-crawler
analyzed_commit: d6aa388a03c12e777846a704818ba5903a021a4f
analyzed_branch: main
analyzed_at: 2026-10-15T08:55:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [snapshot file listing, wc -l over the snapshot, main.py, manufacturer/__init__.py, eventHandler/, database/, utils/, formats/, .dockerignore, utils/helpers.py, database/noShowRecord.py, README.md]
---

# manufacturer-crawler: Structure

## Layout (Phase B)

Flat Python project; no package metadata (`setup.py` and `pyproject.toml` absent). Modules import by top-level names (`import constants`, `from utils import ...`, `from database import ...`), so the repo root must be on `sys.path` (the Lambda task root provides that).

| Path | Role | Lines (approx.) |
|---|---|---|
| `main.py` | `lambda_handler`, `create_chrome_driver`, SQS loop, per-event dispatch, crawler selection per manufacturer, recrawl-log backfill | 461 |
| `constants.py` | portal URLs, event types, statuses, Slack formats, `ACCOUNT_MAPPING`, `timezoneMapping`, recrawl ignore reasons | 206 |
| `eventHandler/` | one handler per event type (`bot_trigger.py`, `bot_triggers.py`, `recrawl.py`, `cron_job.py`, `disconnected_monitors.py`, `test_report.py`) and `event_schema.py` | about 1.2k |
| `manufacturer/Abbott_Merlin/` | `abbott.py` (login), `patient_crawler.py`, `transmission_crawler.py`, `disconnected_monitors.py`, `common.py`, `utils.py`, `customize_column.py`, `constants.py` | about 1.9k |
| `manufacturer/Biotronik/` | `biotronik.py`, `disconnected_monitors.py` | about 0.7k |
| `manufacturer/Boston_Scientific/` | `boston.py` (login, NXT vs Clarity), `latitude_nxt.py`, `latitude_clarity.py`, `disconnected_monitors*.py`, `handle_date_picker.py` | about 2.1k |
| `manufacturer/Medtronic_Carelink/` | `carelink.py`, `patient_crawler.py`, `transmission_crawler.py`, `disconnected_monitors.py`, `common.py`, `utils.py`, `trackAlert.py`, `search_patient.py`, `customize_column.py`, `constants.py` | about 2.9k |
| `manufacturer/__init__.py` | exports `crawl_mdc`, `crawl_boston`, `crawl_abbott`, `crawl_biotronik` | 4 |
| `database/` | thin pymongo helpers (`connection`, `db_secret`, `getPatient`, `getReports`, `getDocument`, `insertDocument`, `updateDocument`, `run_aggregation`, `export`, `noShowRecord`) | about 0.45k |
| `utils/` | config and secrets (`config.py`, `secretString.py`), Slack (`slack.py`), S3 (`exportToS3.py`), dates, helpers, logger, response, accounts | about 0.65k |
| `formats/` | name and date formatting helpers | about 55 |
| `Dockerfile`, `bitbucket-pipelines.yml`, `requirements.txt`, `.dockerignore`, `sonar-project.properties`, `README.md`, `.gitignore`, `.env.example` (not read) | build, delivery, docs | |

## Entry points

- Lambda: `main.lambda_handler` (`Dockerfile` CMD).
- Local: truthy `LOCAL_EXECUTION` switches `create_chrome_driver` to a locally installed Chrome and driver given by env vars. The README says "python main.py", but no file in the repo has a `__main__` block (grep), so that command defines functions and exits (observed).

## Size hotspots

Largest files: `manufacturer/Medtronic_Carelink/transmission_crawler.py` 732, `manufacturer/Boston_Scientific/latitude_nxt.py` 613, `manufacturer/Medtronic_Carelink/disconnected_monitors.py` 558, `Medtronic_Carelink/patient_crawler.py` 529, `Abbott_Merlin/transmission_crawler.py` 528, `main.py` 461, `Abbott_Merlin/patient_crawler.py` 457, `Biotronik/biotronik.py` 455, `Boston_Scientific/latitude_clarity.py` 437. Each manufacturer repeats a similar crawler structure (patient crawl, transmission crawl, disconnected monitors, utils), so a change to shared behavior (login halting, Slack format, status log writing) usually touches several copies (repeated calls to `setAccountsAsHalted`, `insert_or_replace_document`, `generate_log` across the four packages).

## Observations

- `.dockerignore` excludes `*.md`, `.env`, `.env.example`, the pipeline file and Sonar config from the image.
- Import-time state: `main.py` creates three `tempfile.mkdtemp()` dirs (removed in `finally`; on a warm container they are removed after the first invocation and not recreated, inferred); `utils/config.py` fetches the secret from Secrets Manager at import and computes `utc_now`, `date_prefix`, `timestamp` once per container, so the default screenshot S3 key repeats across warm invocations (observed, effect inferred).
- Dead or duplicate code: `database/noShowRecord.py` `log_failed_noshow_records` is marked "Unused function"; `utils/helpers.py` defines `get_next_send` twice (the second wins); `eventHandler/disconnected_monitors.py` keeps a commented-out block.
