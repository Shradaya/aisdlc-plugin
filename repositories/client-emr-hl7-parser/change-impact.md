---
repository: client-emr-hl7-parser
analyzed_commit: 542997c1b6c48c4e410090b6d49e92e02cd5c8ba
analyzed_branch: main
analyzed_at: 2026-10-15T08:46:00Z
generator: aisdlc@1.0.0
status: inferred
confidence: medium
evidence: [main.py, src/config.py, src/eventHandler/__init__.py, src/eventHandler/contants.py, src/eventHandler/oru.py, src/eventHandler/adt.py, src/eventHandler/ack.py, src/eventHandler/dft.py, src/eventHandler/idco_oru.py, src/eventHandler/utils.py, src/accountHandler/__init__.py, src/accountHandler/util.py, src/database/connection.py, src/database/query.py, src/utils/aws.py, src/utils/slack.py, src/utils/constants.py, hl7/parser.py, hl7/creator/hl7Creator.py, bitbucket-pipelines.yml, requirements.txt]
---

# Change-impact map (Phase K)

Repository: `${AISDLC_REPOS_ROOT}/client-emr-hl7-parser`. Tags: `[observed]` seen in code at `b961512`; `[inferred]` reasoned. Consumers and producers outside this repo are `unknown`: the repo is not registered in the workspace and has no edge in `system/repository-relationships.yaml` (checked by grep). There is no test suite, so nothing guards any change below `[observed]`.

## 1. Contracts that must stay in sync

| Contract | Where | What breaks if changed |
|---|---|---|
| Event `{eventType, value}` with eventType in `ORU_CREATION`, `IDCO_ORU_CREATION`, `DFT_CREATION`, `ADT_PARSING`, `ACK_PARSING` | `main.py`, `src/eventHandler/__init__.py` | Invokers (`unknown`). Renaming a key gives `KeyError` caught into a 202 error response. `value` is a report id for creation types and raw HL7 text for parsing types. |
| Response `{status, message, error?, adt_id?}`; `message` is the ACK text (parsing) or `{hl7_path, pdf_path}` (creation) | `main.py`, handlers | Invoker reads of ACK text and S3 keys (`unknown`). Status 202 = error but `except ParserError: pass` yields success-looking responses. |
| Env `SM_REGION`, `SM_NAME`, `BASE_PATH`, `PROCESSED_BUCKET`, `BASE_URL`, `BILLING_LAMBDA_ARN`, `MANUFACTURER_BUCKET_MAPPING`; secret keys `DB_URI`, `DATABASE_NAME`, `SLACK_URL`, `EVOKE_SLACK_URL` | `src/config.py` | Import-time failure if required ones are missing. `BASE_URL` composes patient report links in `covenant`/`tenet` utils; `MANUFACTURER_BUCKET_MAPPING` drives IDCO source bucket. |
| S3 layout: `orus/`, `adts/`, `acks/`, `dfts/`, `ehr_orus/`, `pdfs_with_cover_page/` in `PROCESSED_BUCKET`; file names `<report>-<status>.hl7`, `<report>-CSR.hl7`, `<report>-<status>-IDCO.hl7`, `<control_id>.hl7`; `reports.file_path`/`hf_file_path`/`hl7_file_path` read as S3 keys | `src/config.py`, handlers | Downstream delivery/export and `rest-api-evoke` readers of these keys (`unknown`). |
| MongoDB collections and fields read/written: `patients`, `adts`, `acks`, `tasks`, `patient_diagnoses`, `sequencers`, `accounts` (`name`, `timezone`, `idtf`, aliases), `devices` (billing info by model/manufacturer), `reports`, `report_cover_pages`, `report_notes`, `hl7jobs` (types `ORU_R01`, `DFT_P03`, `IDCO_ORU_R01`), `users` (name `EVOKE AUTOMATED NOTES`) | `src/database/query.py`, `src/utils/constants.py`, `src/database/user.py` | Shared database; owners `unknown` beyond `system/repository-relationships.yaml` (application/config collections owned by `rest-api-evoke`; `patients`, `reports`, `tasks` shared). No models, so schema drift is silent. |
| Facility routing: `APPLICATION_FACILITY_MAPPER` (lower-case sender/account names and upper-case 3-letter prefixes) -> facility keys | `src/eventHandler/contants.py` | Outbound creation does `APPLICATION_FACILITY_MAPPER[account.lower()]` (`KeyError` if the portal account name is not mapped). Inbound unmapped sender falls back to the raw sender and a "New ORU/ADT Clinic Found" Slack alert with default ACK and no DB writes. Account names must match `accounts.name` in Mongo. |
| Registries keyed by the facility string | `src/accountHandler/__init__.py` | A key present in the facility map but missing in `ORU_CREATOR_MAPPER`/`ACCOUNT_UTIL_MAPPER`/`DFT_CREATOR_MAPPER` raises `KeyError` at runtime, not import. |
| Message-type allow-lists `ADT_SUPPORTED_MESSAGE_TYPES`, `ORU_SUPPORTED_MESSAGE_TYPES`; billing code sets `HF_BILLING_CODES`, `DAY_31_CODES` | `src/eventHandler/contants.py` | Allow-list drives ACK status (`AA`/`AE`); `DAY_31_CODES` sets `next_send_cycle` 31 vs 91 on patients (consumed by the billing-schedule logic `unknown`, plausibly `patient-billing-schedule` `[inferred]`). |
| ACK/ORU wire format per client (MSH-3 `EVOKE`, MSH-4 `EMC`, version 2.3 or 2.6, OBR/OBX content) | `src/accountHandler/<client>/{ack,oru,dft}.py` | Client EMR interface acceptance (external, `unknown`). |

## 2. Highest-blast-radius files

| File | Why |
|---|---|
| `src/database/query.py` (605 lines) and `query_utils.py` | all Mongo reads/writes; `upsert_patients`, `insert_adts`, `get_report` are used by every inbound and outbound path; the patient-identity match and `sequencers` counter are shared with other writers `[inferred]`. |
| `src/eventHandler/contants.py` | pure data but changes routing for production clients on deploy; also `CLINIC_IDENTIFIER_FROM_MSH_5` is a plain string, so `in` is substring matching. |
| `src/accountHandler/__init__.py` | import of every client; a syntax/import error in any client package breaks all events at import time. |
| `hl7/parser.py`, `hl7/extractor/*`, `hl7/creator/*` | used by all clients; extractor field positions feed `info` dicts consumed by account modules. |
| `src/config.py` | import-time side effects (Secrets Manager call, broad `except`). |
| `src/utils/aws.py` | `BASE_PATH` temp dir is wiped in `finally` of every invoke; S3 key construction. |

## 3. Change by area

| Area changed | Files directly affected | Also affected / check | Tests |
|---|---|---|---|
| Add alias/sender to an existing client (e.g. EL-5353) | `src/eventHandler/contants.py` | confirm ACK/ORU registries already have the facility; confirm `accounts.name` in Mongo for outbound (lower-cased lookup); no other file | none; verify with `main.py` CLI and sample HL7 |
| Add a new client | new `src/accountHandler/<client>/`, `src/accountHandler/__init__.py`, `src/eventHandler/contants.py` | `accounts` doc and `timezone` (external), hl7job creation/delivery (external), `get_clinic_settings`; see architecture.md section 5 | none |
| Change an existing client's ORU/ACK/DFT | `src/accountHandler/<client>/*.py` | other facilities sharing the package: `uch_cupid` serves `PUEBLO` and `UCH`; `covenant` serves `CAET`, `Parkway Cardiology Associates`, `Knoxville Heart Group`; `tenet` serves all TENET aliases | none |
| Inbound ADT/ORU parsing | `src/eventHandler/adt.py`, `oru.py`, `hl7/extractor/*`, `src/database/query.py` | ACK correctness, `patients` upsert, duplicate check by `(account, control_id)`; known defects (`updated_patient` unbound on duplicate/unknown clinic; `info` undefined after extraction failure; `except ParserError: pass`) | none |
| Device model matching | `src/eventHandler/utils.py` (`find_best_match`), `query.fetch_device_billing_info`, `get_all_devices_by_manufacturer` | patient `billing_code`/`next_send_cycle`; the threshold bug makes matches overly permissive (`best_score * 100 >= threshold` on 0-100 scores) `[observed]`; fixing it changes which devices match | none |
| Outbound ORU/DFT/IDCO | `src/eventHandler/{oru,dft,idco_oru}.py`, `src/utils/aws.py`, `pdf/utils.py` | hl7job types and report fields (`billing_code`, `billing_diagnosis_codes`, `report_date`, `result_status`, `cover_page_URL`); S3 prefixes; IDCO only for `UCH`/`PUEBLO` | none |
| Response/error handling, Slack | `main.py`, `src/utils/slack.py` | invoker success detection, Slack channel noise; Slack call has no timeout | none |
| Config/secrets | `src/config.py` | every module (import-time); Lambda env and Secrets Manager secret (external) | none |
| Dependencies | `requirements.txt` | not bundled by the pipeline (layer assumed `[inferred]`); `mongoengine` pinned but unused; `Levenshtein`, `python-Levenshtein` and `RapidFuzz` overlap | none |
| Pipeline | `bitbucket-pipelines.yml` | push to `main` deploys to production with no test step; `lf-uat` deploys to UAT | none |

## 4. Dead or suspicious code (verify before editing or deleting)

- `src/accountHandler/pueblo/` and `src/accountHandler/uch/` not imported by the registries (`[inferred]` dead); `PUEBLO`/`UCH` run on `uch_cupid`.
- `ENV_VARS.BILLING_LAMBDA`, `ENV_VARS.EVOKE_SLACK_URL`, `ENV_VARS.PDF_PATH` set but not read (grep). `src/utils/pdf.py` duplicates `pdf/utils.py`. `src/utils/testPDF.pdf` is a tracked binary fixture with no reference found.
- `ACK_CREATOR_MAPPER['COVENANT']` has no sibling entries; `base/` directory exists untracked and empty in the working tree.

## 5. Unknowns

- Callers and delivery path for generated HL7; Lambda deployment settings; collection owners and schemas; relation to `client-ehr-hl7-export` and `manufacturer-hl7-parser` (a different Lambda: names are similar but this repo's code does not reference it); correct handling for CI/UAT branch `lf-uat` promotion flow.
