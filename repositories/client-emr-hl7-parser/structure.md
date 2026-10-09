---
repository: client-emr-hl7-parser
analyzed_commit: b9615126ee17c4e2583e08ac81faaa9d12c63005
analyzed_at: 2026-10-09T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [main.py, readme.md, hl7/, pdf/, src/accountHandler/__init__.py, src/eventHandler/__init__.py, src/database/, src/utils/, bitbucket-pipelines.yml, .gitignore, .vscode/launch-example.json]
---

# client-emr-hl7-parser: Structure

Repo: `${AISDLC_REPOS_ROOT}/client-emr-hl7-parser`. Source from `git ls-files` (120 files).

## Top-level map

| Path | Role |
|---|---|
| `main.py` | Lambda entry `lambda_handler`; dispatch by `eventType`; Slack notify; cleans temp dir (`empty_directory`) in `finally`; CLI `__main__`. |
| `src/config.py` | `ENV_VARS` dotdict. Reads local `.env` (key=value lines) else AWS env vars plus Secrets Manager secret. Also defines S3 key prefixes. |
| `src/eventHandler/` | One module per event type: `oru.py` (ORU creation and ORU parsing), `adt.py`, `ack.py`, `dft.py`, `idco_oru.py`; `__init__.py` holds `EVENT_TYPE_MAPPER`; `contants.py` (sic) holds `APPLICATION_FACILITY_MAPPER`, supported message types, billing code lists; `utils.py` helpers (`merge_dicts`, `find_best_match`, `call_func_if_available`, `split_billing_code_and_modifier`). |
| `src/accountHandler/` | Per-client customisation. `__init__.py` builds `ORU_CREATOR_MAPPER`, `ACK_CREATOR_MAPPER`, `DFT_CREATOR_MAPPER`, `IDCO_ORU_CREATOR_MAPPER`, `ACCOUNT_UTIL_MAPPER`. Each account dir has `ack.py`, `oru.py`, `utils.py`, usually `constants.py`, sometimes `dft.py` / `idco_oru.py`. Shared: `constants.py`, `util.py`. Dirs: aspen, bond, cch, centra, covenant, denver, grand_heart, pueblo, tenet, tj_samson, toledo, uch, uch_cupid. |
| `src/database/` | `connection.py` (singleton `Mongo` over pymongo), `query.py` (collection queries and writes), `query_utils.py` (filters, payload builders, billing schedule), `user.py` (resolve automation user id). |
| `src/utils/` | `aws.py` (S3 download, upload, Glacier restore, temp cleanup), `slack.py`, `date.py`, `format.py`, `logger.py`, `pdf.py` (merge PDFs), `constants.py` (collection names, gender and timezone maps, billing day lists), `utils.py` (`read_local_file`), `testPDF.pdf` sample. |
| `hl7/` | Package named `hl7` (shadows the PyPI `hl7` name; wraps `hl7apy`). `parser.py` (`parse`, `extract_information_oru/adt/ack`), `structure.py`, `FieldValue.py`, `utils.py`; `creator/` (`HL7Creator`, message constants); `extractor/` (ack, adt, general, obx extractors/mapper, constants). |
| `pdf/` | `utils.py`: `merge_pdfs`, `get_report_page_count` (pymupdf). A near-duplicate exists in `src/utils/pdf.py`. |
| `bitbucket-pipelines.yml` | Deploy pipelines for `lf-uat` and `main`. |
| `.env-example`, `.vscode/launch-example.json` | Local run templates. `.env` and `.vscode/launch.json` are gitignored (`.gitignore` lines 54, 55). |
| `readme.md`, `requirements.txt` | Docs (partly stale: lists no `accountHandler`) and pinned deps. |

## Control flow

1. `lambda_handler` -> `EVENT_TYPE_MAPPER[eventType](event, response)`.
2. Inbound path (`adt_parse` / `oru_parse`): `hl7.parser.parse` -> extractor -> resolve facility via `APPLICATION_FACILITY_MAPPER` (MSH sender, prefix rule, `COVENANT` alias lookup in DB) -> upsert patient / insert ADT in MongoDB -> raw HL7 uploaded to S3 -> `ACK_CREATOR_MAPPER[account]` builds ACK (default ACK plus Slack notice if account unknown).
3. Outbound path (`oru_create`, `dft_create`, `idco_oru`): fetch `reports`, `report_cover_pages`, `hl7jobs` -> localize dates per account setting -> optionally merge cover page and report PDF from S3 -> `<TYPE>_CREATOR_MAPPER[facility]` builds message -> `create_hl7_file` writes to `BASE_PATH` and uploads to `PROCESSED_BUCKET`.

## Adding a new client (observed pattern, inferred as the convention)

Add aliases to `APPLICATION_FACILITY_MAPPER` and a facility dir under `src/accountHandler/` with `ack.py`, `oru.py`, `utils.py`, then register in all mappers in `src/accountHandler/__init__.py`. The latest commit only extended the Tenet alias list (`src/eventHandler/contants.py`).

## Unknowns

- Whether `src/accountHandler/uch/` and `pdf/utils.py` are referenced (not exhaustively traced).
- No infrastructure-as-code in this repo.
