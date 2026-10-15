---
repository: manufacturer-hl7-parser
analyzed_commit: 55bae1b09c246af044531301560276ec7f3ab3a2
analyzed_at: 2026-10-15T08:31:52Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [git ls-tree 55bae1b, readme.md, src/**, hl7/**, pdf/**, tests/**]
---

# Structure (Phase B)

152 tracked files at `55bae1b` (149 at the onboarding commit `e185ff3`); `.py` count not recounted. No build step: the pipeline zips the working tree minus `tests/*` (see `build-release.md`).

## Top level

| Path | Role |
|---|---|
| `main.py` | Entry point: `lambda_handler`, `process`, CLI `--path` |
| `hl7/` | HL7 parsing: `parser.py`, `structure.py`, `constants.py`, `utils.py`, `creator.py`; `extractor/` (`generalExtractor`, `obxExtractor`, `obxMapper`, `noteExtractor`, `FieldValue`) |
| `pdf/` | PyMuPDF helpers: `crop.py`, `extraction.py`, `utils.py` |
| `src/` | Pipeline code (below) |
| `tests/` | `conftest.py`, `unit/` (13 test files) |
| `bitbucket-pipelines.yml` | Per-branch Lambda deploy |
| `requirements.txt`, `.env-example`, `readme.md`, `.vscode/launch-example.json`, `.gitignore` | Config and docs |

The local package `hl7/` has the same import name as the PyPI package `hl7`; the repo depends on `hl7apy`, so this is a naming hazard only (observed).

## `src/`

| Path | Role |
|---|---|
| `config.py` | Builds `ENV_VARS` (dotdict): local `.env`, else Secrets Manager + env vars |
| `constants.py` | Billing codes, tab names, send cycles, `SUPPORTED_FORMATS` |
| `processor.py` (618 lines) | Pipeline steps called by `main.process` |
| `delay_message_processing.py` | Rule-driven delay decision engine |
| `manufacturer/` | `abbott`, `biotronik`, `boston`, `medtronic` (PDF + alert logic), `general` (shared helpers), `constants`; `__init__.py` maps manufacturer name to report/alert functions |
| `database/` | `connection.py` (`Mongo` singleton), `query.py` (1080 lines), `user.py`, `utils.py`, `models/` (~31 collection models + `embeds/` 20 embedded documents) |
| `notes/` | `automate.py`, `note_creator.py`, `noteCreator/*` (one module per section: arrhythmias, battery, burden, impedance, lead, pacing, sensing, threshold, ...), `query.py`, `constants.py` (708 lines) |
| `analytics/` | `patientAnalytics.py`, `query.py`, `utils.py` |
| `artanis/` | `sender.py`, `query.py`, `constants.py` (unreachable at this commit, see `architecture.md`) |
| `events/` | In-process event emitter; `report_inserted` writes `user_activity_logs` |
| `utils/` | `aws.py`, `date.py`, `format.py`, `logger.py`, `slack.py`, `customExceptions.py`, `billingCompatibility.py`, `globalContext.py`, `utils.py` (threaded task runner) |

## Size hotspots

`src/database/query.py` 1080, `src/notes/constants.py` 708, `src/processor.py` 618, `src/manufacturer/medtronic.py` 359, `hl7/extractor/obxMapper.py` 355, `src/manufacturer/general.py` 295, `src/notes/automate.py` 276.

## Dead or unreferenced code (observed by grep, medium confidence)

- `src/artanis/sender.py:get_notes_information_from_images`: imported in `src/artanis/__init__.py`, no caller.
- `hl7/creator.py` `create_oru`: no caller; reported by the architecture analyst as importing `clinic_mapper`, which `FieldValue.py` does not define (not independently verified).
- Models never queried directly: `hospitals` (only a reference target), `report_note_suggestions`, `report_note_templates`.
- `processor.py` has duplicated `parse_hl7_message` / `parse_hl7_format` (`:83`, `:222`).

## Documentation drift

`readme.md` says `requiremnts.txt` (typo), `.env.example` (file is `.env-example`), and `python main.lambda_handler` (not a runnable command).
