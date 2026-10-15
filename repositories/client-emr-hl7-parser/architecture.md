---
repository: client-emr-hl7-parser
analyzed_commit: 542997c1b6c48c4e410090b6d49e92e02cd5c8ba
analyzed_branch: main
analyzed_at: 2026-10-15T08:46:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [main.py, src/config.py, src/eventHandler/__init__.py, src/eventHandler/contants.py, src/eventHandler/oru.py, src/eventHandler/adt.py, src/eventHandler/ack.py, src/eventHandler/dft.py, src/eventHandler/idco_oru.py, src/eventHandler/utils.py, src/accountHandler/__init__.py, src/accountHandler/util.py, src/accountHandler/constants.py, src/accountHandler/tenet/, src/accountHandler/uch_cupid/, src/database/connection.py, src/database/query.py, src/utils/aws.py, src/utils/slack.py, src/utils/constants.py, hl7/__init__.py, hl7/parser.py, hl7/creator/hl7Creator.py, bitbucket-pipelines.yml, requirements.txt, readme.md]
---

# Architecture (Phase C)

Repository: `${AISDLC_REPOS_ROOT}/client-emr-hl7-parser`. Claims are `observed` (seen in code at `b961512`) unless tagged `[inferred]` or `unknown` (with what was checked). Secrets and env are named by variable only. Not read: `.env-example` (read denied by tooling; contents `unknown`). Deployed Lambda configuration (handler string, triggers, memory, timeout, VPC, IAM, layers) is not in the repo and is `unknown`; checked: all 120 tracked files, no SAM/CloudFormation/Terraform/Dockerfile.

## 1. Shape of the system

A single Python AWS Lambda with no web server, scheduler or threads. It is the client-EMR (hospital EHR) HL7 v2 gateway for Evoke: it parses inbound ADT/ORM/ORU/ACK messages into MongoDB (patients, adts, acks, tasks) and builds outbound ORU_R01, IDCO ORU_R01 and DFT_P03 messages from reports already in MongoDB, writing them to S3. Everything is synchronous and sequential. About 120 tracked files, about 3,300 lines in the core packages plus per-account modules. No tests directory and no `requirements`-declared test tooling (observed by file listing).

## 2. Entry points

| Entry | Where | Detail |
|---|---|---|
| Lambda handler | `lambda_handler(event, context)` in `main.py` | Deployed handler string `unknown`; the pipeline zips the repo root so `main.lambda_handler` is the only plausible handler `[inferred]` (`bitbucket-pipelines.yml`, `readme.md`). |
| CLI | `main.py` `if __name__ == '__main__'` | `python main.py --eventType <type> --value <v>`; calls `lambda_handler` with `context=None`. Requires a local `.env` (so `ENV_VARS.local=True` and Slack is skipped). |

Event contract: `{"eventType": <key>, "value": <string>}` (`main.py`). `eventType` is looked up in `EVENT_TYPE_MAPPER` (`src/eventHandler/__init__.py`):

| eventType | Handler | `value` is | Direction |
|---|---|---|---|
| `ORU_CREATION` | `src/eventHandler/oru.py:oru_create` | report id | outbound: Mongo -> HL7 ORU_R01 file in S3 |
| `IDCO_ORU_CREATION` | `src/eventHandler/idco_oru.py:oru_create` | report id | outbound: IDCO ORU_R01 built from the stored manufacturer HL7 |
| `DFT_CREATION` | `src/eventHandler/dft.py:dft_create` | report id | outbound: DFT_P03 file in S3 |
| `ADT_PARSING` | `src/eventHandler/adt.py:adt_parse` | raw HL7 text (path in local mode) | inbound; also routes `ORU_R01` messages to `oru_parse` |
| `ACK_PARSING` | `src/eventHandler/ack.py:ack_parse` | raw HL7 ACK text | inbound |

Unknown `eventType` raises `KeyError`, caught by the outer `except` (section 8). Invoker identity, trigger type and payload producers are `unknown` (no trigger config in repo). The only cross-repo hint is that `rest-api-evoke` publishes `{hl7JobId}` for `ORU_R01`, `DFT_P03` and `IDCO_ORU_R01` hl7jobs to SNS and an external consumer renders/delivers HL7 (`system/repository-relationships.yaml`, edge to `client-ehr-hl7-export`); whether this Lambda is that consumer is `unknown` (the name match is `[inferred]` only; this repo has no edge recorded in the relationships file, checked by grep).

Response contract: `{'status': 200|202, 'message', 'error'?, 'adt_id'?}`. Status starts at 202 and becomes 200 only when no `error` was set (`main.py`). `notify` is popped before return.

## 3. Modules and responsibilities

```
main.py                         handler, response envelope, Slack notify, temp-dir cleanup
hl7/                            HL7 package (shadows the PyPI name `hl7`; wraps hl7apy)
  __init__.py                   re-exports hl7apy ParserError
  parser.py                     parse(), extract_information_{adt,ack,oru}
  extractor/                    segment extractors (general MSH/PID, adt PV1/IN1/GT1/DG1/OBR/ORC, obx, ack MSA)
  creator/hl7Creator.py         HL7Creator: builds Message/segments; contants.py has segment names
  FieldValue.py, structure.py, utils.py (generate_control_id, base64 helpers)
src/config.py                   ENV_VARS (.env locally, Secrets Manager + env in Lambda)
src/eventHandler/               one module per eventType + contants.py (facility/alias maps, message-type allow-lists)
src/accountHandler/             per-client packages + __init__.py registries (section 5)
src/database/                   connection.py (pymongo singleton `Mongo`), query.py (all reads/writes), query_utils.py, user.py
src/utils/                      aws.py (S3, temp dir), slack.py, date.py, format.py, pdf.py, constants.py (collection names)
pdf/                            utils.py (PyMuPDF merge, page count); src/utils/pdf.py is a near-duplicate
```

Persistence uses raw `pymongo` through a singleton `MongoConnection` (`src/database/connection.py`). `mongoengine` is pinned in `requirements.txt` but never imported (grep over all `.py`) `[observed]`, so there is no ODM and no model layer; the brief's "mongoengine" description does not hold at this commit.

## 4. Data flows

Inbound ADT/ORM (`ADT_PARSING`, `adt.py`): parse (hl7apy) -> unsupported message types set status `AE` -> `extract_information_adt` -> `map_clinic_name` (facility from `APPLICATION_FACILITY_MAPPER` by MSH sender, then clinic-code prefix, then `CLINIC_IDENTIFIER_FROM_MSH_5` alias lookup via `get_patient_by_account_alias`) -> normalize dates/names -> upload raw HL7 to S3 `ENV_VARS.ADT_PATH` (`adts/`) in `PROCESSED_BUCKET` -> `check_duplicate_adts(account, control_id)` -> if the account has an ACK creator: `upsert_patients` and `insert_adts`, set `response['adt_id']` -> build ACK via account `ACK_CREATOR_MAPPER` else `create_default_ack` plus Slack notice "New ADT Clinic Found". Message types: ADT_A02/A03/A04/A08/A31 and ORM_O01 (`ADT_SUPPORTED_MESSAGE_TYPES`).

Inbound ORU (reached from `adt_parse` when type is `ORU_R01`, `oru.py:oru_parse`): extract header/patient/visit/OBX -> facility mapping (same logic) -> `get_account_by_name` for `idtf` -> upload to `ehr_orus/` -> duplicate check -> device lookup `fetch_device_billing_info` with fuzzy fallback `find_best_match` (RapidFuzz) -> `next_send_cycle` 31 for codes in `DAY_31_CODES`, else 91 -> `upsert_patients`, `insert_adts(info, "inOffice")`, `create_task` ("NEW PATIENT" automated task) -> ACK.

Inbound ACK (`ack.py`): parse, upload to `acks/`, `insert_ack(path)`, return the ack code.

Outbound ORU (`oru.py:oru_create`): `get_report`, `get_report_cover_page` (skipped for connectivity-status "CSR" reports), `get_hl7jobs(report_id, 'ORU_R01')` -> must all exist else error "Documents required to create ORU_R01 not found" -> facility via `APPLICATION_FACILITY_MAPPER[account.lower()]` -> `ACCOUNT_UTIL_MAPPER[facility]`: either `generate_content_for_base64` (text content) or download cover + body PDFs from S3 and `get_report_with_cover_page` (merge, upload) -> `ORU_CREATOR_MAPPER[facility]` builds the message -> `create_hl7_file` writes to `/tmp`-style `BASE_PATH` and uploads to `orus/` (file `<id>-<status>.hl7` or `<id>-CSR.hl7`). Response `message` = `{hl7_path, pdf_path}`.

Outbound IDCO ORU (`idco_oru.py`): job type `IDCO_ORU_R01`; only `UCH` and `PUEBLO` have creators (`IDCO_ORU_CREATOR_MAPPER`), else error "IDCO ORU not implemented for the clinic". Reads the original manufacturer HL7 from a per-manufacturer bucket (`MANUFACTURER_BUCKET_MAPPING` JSON env) with Glacier restore handling (`get_file_content_with_restore`), parses it, passes it to the creator; output `<id>-<status>-IDCO.hl7` in `orus/`.

Outbound DFT (`dft.py`): job type `DFT_P03`; creators for `DENVER HEALTH`, `TOLEDO`, `GRAND HEART`, `UCH`, `PUEBLO` (`DFT_CREATOR_MAPPER`); output `dfts/<id>.hl7`.

Delivery of produced files to the clinics (SFTP/MLLP/other) is not in this repo: `unknown` (checked: no sftp/mllp/socket code in `src`).

## 5. Account (client) handler architecture

Registries in `src/accountHandler/__init__.py`, all keyed by the facility string produced by `APPLICATION_FACILITY_MAPPER` values (`src/eventHandler/contants.py`):

| Registry | Value | Used by |
|---|---|---|
| `ORU_CREATOR_MAPPER` | `<pkg>/oru.py:create_oru(account, info)` | `eventHandler/oru.py` |
| `ACK_CREATOR_MAPPER` | `<pkg>/ack.py:create_ack(account, status, control_id)` | `adt.py`, `oru.py`. Presence also acts as the "known clinic" gate for DB writes |
| `DFT_CREATOR_MAPPER` | `<pkg>/dft.py:create_dft` | `dft.py` |
| `IDCO_ORU_CREATOR_MAPPER` | `uch_cupid/idco_oru.py:create_idco_oru` | `idco_oru.py` |
| `ACCOUNT_UTIL_MAPPER` | module `<pkg>/utils.py` | all handlers; looked up by `call_func_if_available(module, 'get_clinic_settings')` and `hasattr(..., 'generate_content_for_base64')`, `get_report_with_cover_page` |

Per-account package layout (for example `tenet/`): `__init__.py`, `constants.py` (`CLINIC_NAME`, `APPLICATION_NAME`), `ack.py`, `oru.py`, `utils.py` (`get_report_with_cover_page`, optional `generate_content_for_base64`, `get_obr_4_info`, optional `get_clinic_settings` returning e.g. `{'localized_date': ...}`), optional `dft.py`, `idco_oru.py`. Shared helpers: `src/accountHandler/util.py`, `src/accountHandler/constants.py`, `hl7/utils.py`.

Current facilities (keys in `ORU_CREATOR_MAPPER`): PUEBLO, CENTRA, CCH, ASPEN, UCH, DENVER HEALTH, BOND, TOLEDO, CAET, Parkway Cardiology Associates, Knoxville Heart Group (these three share the `covenant` package), TJ SAMSON, GRAND HEART, TENET. Quirks observed:
- `PUEBLO` and `UCH` both point to `uch_cupid` (ORU, ACK, util, DFT, IDCO). The directories `src/accountHandler/pueblo/` and `src/accountHandler/uch/` are not imported by `src/accountHandler/__init__.py` and nothing else imports them (grep) so they look dead `[inferred]`.
- `ACK_CREATOR_MAPPER` has a `COVENANT` key that has no entry in the ORU or util registries; it is reachable only via the MSH-5 alias path (`CLINIC_IDENTIFIER_FROM_MSH_5 = ("COVENANT")`, a string, so `alias in` is a substring test `[observed]`).
- `centra`, `pueblo`, `uch_cupid` have no `constants.py` import of the same shape for some packages (e.g. no `centra/constants.py` file); do not copy blindly, copy a package with the full file set such as `tenet/`.

### How to add a new account/client handler (procedure derived from code `[inferred]`)

1. Create `src/accountHandler/<new_client>/` with `__init__.py`, `constants.py`, `ack.py` (`create_ack`), `oru.py` (`create_oru`), `utils.py` (at least `get_report_with_cover_page` or `generate_content_for_base64`, plus `get_obr_4_info`, optional `get_clinic_settings`). Add `dft.py` / `idco_oru.py` only if those message types are needed. Easiest template: `tenet/` (text-content ORU) or `denver/` (PDF cover page + DFT).
2. In `src/accountHandler/__init__.py`: import the new `create_oru`, `create_ack`, `utils` (and `create_dft`/`create_idco_oru`), and add entries to `ORU_CREATOR_MAPPER`, `ACK_CREATOR_MAPPER`, `ACCOUNT_UTIL_MAPPER` (+ `DFT_CREATOR_MAPPER`, `IDCO_ORU_CREATOR_MAPPER` if applicable) under one facility key.
3. In `src/eventHandler/contants.py` `APPLICATION_FACILITY_MAPPER`: add lower-case sender/account-name aliases (the MSH-4 sending facility for inbound, and the portal `accounts.name` lower-cased for outbound) mapping to the facility key. If senders use `<PREFIX>-<digits>` codes, add the upper-case 3-letter prefix key (prefix-matched by `prefix[:3]`). If the client identifies only via MSH-5, extend `CLINIC_IDENTIFIER_FROM_MSH_5`.
4. If the account needs local-timezone dates, return `{'localized_date': True}` from `utils.get_clinic_settings`; the account document in MongoDB (`accounts`) must carry `timezone` (managed outside this repo).
5. Outside this repo (`unknown` owners): the `accounts` document, hl7jobs creation for the account (`rest-api-evoke` publishes hl7jobs) and delivery routing.

Files that change together: new package + `src/accountHandler/__init__.py` + `src/eventHandler/contants.py`. A pure alias addition to an existing client is only `contants.py` (the HEAD commit `b961512` `EL-5353` is exactly that for TENET: `src/eventHandler/contants.py`, 2 insertions, 1 deletion).

## 5a. Authentication and authorization boundaries

None inside the code: no authN/authZ on the event; trust is entirely the Lambda invoke permission (IAM, `unknown`, outside repo). Credentials: DB URI and Slack webhook(s) come from AWS Secrets Manager (`SM_NAME`, `SM_REGION`; secret keys `DB_URI`, `DATABASE_NAME`, `SLACK_URL`, optional `EVOKE_SLACK_URL`) (`src/config.py`). S3 and Secrets Manager use the Lambda role via boto3 default chain. CI deploy uses Bitbucket OIDC (`AWS_ROLE_ARN`, `oidc: true`) (`bitbucket-pipelines.yml`). Inbound HL7 messages are not authenticated by this code; sender identity is inferred from MSH fields only. PHI (patient name, DOB, MRN) flows through the code and is logged: `ack_parse` logs the whole HL7 message (`log.info(unparsed_message)`) and `main.py` logs the full response `[observed]`.

## 6. Configuration flow

`src/config.py` runs at import. It first tries to read a local `.env` (`key=value` lines, `split('=')`, so values containing `=` break it); on any exception (including a missing file) it switches to Lambda mode: requires env `SM_REGION`, `SM_NAME`, `BASE_PATH`, `PROCESSED_BUCKET`; optional `BASE_URL`, `BILLING_LAMBDA_ARN`, `MANUFACTURER_BUCKET_MAPPING` (JSON, manufacturer to bucket); then fetches the secret at import time. Hard-coded S3 prefixes: `orus/`, `adts/`, `acks/`, `dfts/`, `ehr_orus/`, `pdfs_with_cover_page/`. A broad bare `except` means a malformed `.env` silently falls through to Lambda mode, and a missing `SM_*` raises `KeyError` at import `[observed]`. `BILLING_LAMBDA` and `EVOKE_SLACK_URL` are set but never read elsewhere (grep) `[observed]`. Business routing config (facility aliases, message-type lists, billing codes) is code in `src/eventHandler/contants.py`, so changing it needs a deploy.

## 7. Persistence and external integrations

| Integration | Evidence | Notes |
|---|---|---|
| MongoDB (shared database, `DB_URI`/`DATABASE_NAME`) | `src/database/connection.py`, `query.py`, `src/utils/constants.py` | Collections touched: `patients`, `adts`, `acks`, `tasks`, `patient_diagnoses`, `sequencers` (next evoke id), `accounts`, `devices`, `reports`, `report_cover_pages`, `report_notes`, `hl7jobs`, `users`; `manufacturers`, `adts_book_keeping` named in constants (use unverified). Singleton connection opened at import of `query` (`Mongo = MongoConnection()`) and `server_info()` at construct time; never `disconnect`ed by the handler (reused across warm invokes). No transactions or sessions (grep). |
| S3 (`PROCESSED_BUCKET` + per-manufacturer buckets) | `src/utils/aws.py` | upload/download, Glacier/Deep Archive restore (`Expedited`, 3 days) |
| Slack webhook | `src/utils/slack.py` | `requests.post` to `LF_SLACK_URL`; no timeout set, response only printed |
| PyMuPDF | `pdf/utils.py`, `src/utils/pdf.py` | cover-page + body merge |
| hl7apy | `hl7/parser.py`, `hl7/creator/hl7Creator.py` | parse/build |

The repo-level relationships file records the shared Mongo database as owned elsewhere (`rest-api-evoke` owns application/config collections; `patients`, `reports`, `tasks` shared) (`system/repository-relationships.yaml`, edges around `manufacturer-hl7-parser`); whether this repo's writes are the same schema contract is `unknown` (it is not registered in the workspace at this analysis, `repositories/` has no entry).

## 8. Failure handling

- `lambda_handler` wraps dispatch in `try/except/finally`; any exception logs, sets `error`, sends a Slack error with traceback, and `finally` always empties `BASE_PATH` (`empty_directory`). On error the response status stays 202 (never raises), so the invoker sees a normal return; there is no DLQ/retry logic in code. Retry behavior belongs to the invoker (`unknown`).
- Each handler also catches its own exceptions and writes `error`/`message` into the response. `except ParserError: pass` returns with no error and no ACK `message` set, i.e. a malformed message can end as status 202 without an error text `[observed]` (response keeps `error: None` so it is treated as success: `if not response['error']` sets status 200).
- Parse failure in `adt_parse`/`oru_parse` returns a generic `AR` ACK (`create_default_ack('GENERIC', 'AR')`). Unsupported message types give `AE` (ADT path) or `AR` (ORU path).
- Duplicate protection: `check_duplicate_adts(account, control_id)` skips DB writes but still ACKs `AA`.
- Defects visible in code `[observed]`: in `oru_parse`, `updated_patient` is assigned only when the message is not a duplicate and the account has an ACK creator, but `create_task(updated_patient, ...)` runs unconditionally, so duplicates and unknown clinics raise `UnboundLocalError` (caught, response error). In `adt_parse`, an exception in the inner extraction block leaves `info` undefined at `info['file_path']`. `find_best_match` compares `best_score * 100 >= threshold` with RapidFuzz scores already on 0-100, so the effective cut-off is about 0.8 (almost any non-zero similarity matches a device model). `notify_in_slack` with `context=None` (CLI) would raise on non-local mode only; local mode returns early.

## 9. Background workers, schedules, async boundaries

None in the repo. No threads, queues, timers or SNS/SQS code (grep for sqs/sns/schedule in `src`: none). Async/event boundaries are all external to this repo and `unknown`.

## 10. Build and deploy

`bitbucket-pipelines.yml`: branch `lf-uat` deploys to the UAT Lambda and `main` deploys to the production Lambda; each step zips the repo root (after deleting `.git`, `.gitignore`, the pipeline file), copies to S3 and runs `aws lambda update-function-code --publish`. Dependencies are not installed or bundled in the zip, so a Lambda layer or preinstalled runtime is assumed `[inferred]`; `requirements.txt` lists pinned versions including `hl7apy`, `pymongo`, `PyMuPDF`, `RapidFuzz`, `boto3`, `requests`. No test, lint or build step in the pipeline `[observed]`.

## 11. Unknowns

- Lambda trigger(s), invoker, retry/DLQ, memory/timeout, layers, runtime version; who calls `ORU_CREATION`/`DFT_CREATION`/`IDCO_ORU_CREATION` and who feeds `ADT_PARSING`/`ACK_PARSING` and how the ACK/ORU files are delivered to clinics.
- Whether this Lambda is the consumer behind `client-ehr-hl7-export`; contents of `.env-example` and `.vscode/launch-example.json` (not read).
- Collection schemas and owners (no model definitions in repo).
