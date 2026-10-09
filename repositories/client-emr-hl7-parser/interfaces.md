---
repository: client-emr-hl7-parser
analyzed_commit: b9615126ee17c4e2583e08ac81faaa9d12c63005
analyzed_branch: EL-5353
analyzed_at: 2026-10-09T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [main.py, readme.md, src/config.py, src/eventHandler/__init__.py, src/eventHandler/adt.py, src/eventHandler/ack.py, src/eventHandler/oru.py, src/eventHandler/idco_oru.py, src/eventHandler/dft.py, src/eventHandler/contants.py, src/database/query.py, src/database/connection.py, src/database/user.py, src/utils/aws.py, src/utils/slack.py, src/utils/constants.py, bitbucket-pipelines.yml]
---

# Interfaces (Phase E)

Repository location: `${AISDLC_REPOS_ROOT}/client-emr-hl7-parser`. There are no REST, GraphQL, queue, topic, scheduled or MLLP/SFTP listener interfaces in this repository (grep for routes, `sqs`, `sns`, `sftp`, `socket`: none; no web framework in `requirements.txt`). The single inbound interface is the Lambda event; outbound interfaces are S3, MongoDB and Slack.

## 1. Lambda event interface (inbound)

Handler: `main.lambda_handler(event, context)` (`main.py:7`). The Lambda function name and trigger configuration are not in the repo: invoker and authentication (IAM invoke permission) are `unknown`.

Request schema (`main.py:15`, `src/eventHandler/__init__.py:7-13`):

```
{ "eventType": <one of below>, "value": <string> }
```

| eventType | Handler | `value` semantics | Evidence |
|---|---|---|---|
| `ADT_PARSING` | `adt_parse` | Raw HL7 v2 message text received from a client EMR (local mode: a file path). Despite the name it also accepts `ORU_R01` and `ORM_O01`; ORU_R01 is routed to `oru_parse` | `src/eventHandler/adt.py:57-82`, `src/eventHandler/contants.py:ADT_SUPPORTED_MESSAGE_TYPES` (`ADT_A02, A03, A04, A08, A31, ORM_O01`), `ORU_SUPPORTED_MESSAGE_TYPES` (`ORU_R01`) |
| `ACK_PARSING` | `ack_parse` | Raw HL7 ACK text returned by a client EMR (local mode: a file path) | `src/eventHandler/ack.py:13-18` |
| `ORU_CREATION` | `oru_create` | Report id (Mongo `reports._id` as string); builds an outbound ORU_R01 with an embedded PDF/base64 report | `src/eventHandler/oru.py:111-119`, `main.py:57-60` |
| `DFT_CREATION` | `dft_create` | Report id; builds a DFT_P03 billing message | `src/eventHandler/dft.py:55-63` |
| `IDCO_ORU_CREATION` | `IDCO_oru_create` (`src/eventHandler/idco_oru.py`) | Report id; builds an IDCO ORU_R01 from the manufacturer's original HL7 file | `src/eventHandler/idco_oru.py:163-176` |

An unknown `eventType` raises `KeyError`, caught by the handler: response error plus a Slack notification (`main.py:13,30-34`).

Response schema (`main.py:8-45`):

| Field | Meaning |
|---|---|
| `status` | 200 on success; 202 when an error occurred (comment in code: "set to 202 if error occurs") |
| `message` | Parsing events: the HL7 ACK text to return to the sender (`AA`/`AE`/`AR` in MSA-1), or an error string. `ACK_PARSING`: the ACK code. `ORU_CREATION`: `{hl7_path, pdf_path}` (S3 keys in `PROCESSED_BUCKET`; `pdf_path` may be null). `DFT_CREATION` and `IDCO_ORU_CREATION`: `{hl7_path}` |
| `error` | Present only on failure (string) |
| `adt_id` | Present only for ADT parsing when an `adts` document was inserted/updated (string ObjectId) |
| `notify` | Internal; removed before return (`main.py:42`) |

Error behavior: exceptions are caught, logged, sent to Slack with a CloudWatch log link, and returned as `status` 202 with `error`. Unparseable HL7 returns a generic ACK with `AR` (`adt.py:63-66`); unsupported message types return `AE` status. `ParserError` is swallowed silently (response left at defaults). Duplicates (same account and control id in `adts`) skip patient/ADT writes but still return an ACK (`adt.py:113-126`). Unknown clinic gets a default ACK with sender `EVOKE`/`EMC` and a Slack notice "New ADT Clinic Found" (`adt.py:129-134`, `src/eventHandler/ack.py:create_default_ack`).

Known consumers: unknown. Checked: this repo has no invoker code. Candidates are `rest-api-evoke` (creates `hl7jobs` and publishes to SNS, per `system/repository-relationships.yaml:289-296`) and the unregistered `client-ehr-hl7-export` consumer. Neither is proven to call this Lambda.

CLI (developer): `python main.py --eventType <type> --value <value>` (`main.py:47-71`); requires `.env`. Not a production interface.

## 2. Supported clinics (account mapping)

`APPLICATION_FACILITY_MAPPER` maps MSH sender/application strings to account handlers (`src/eventHandler/contants.py`). Handlers exist under `src/accountHandler/` for: ASPEN, BOND, CCH, CENTRA, COVENANT, DENVER HEALTH, GRAND HEART, PUEBLO, TENET, TJ SAMSON, TOLEDO, UCH, UCH CUPID. The mapper additionally names Parkway Cardiology Associates, CAET, Knoxville Heart Group. DFT creation exists for denver, grand_heart, toledo, uch_cupid; IDCO ORU creation for uch_cupid (`git ls-files`). Latest commit (EL-5353) adds Baptist Heart & Vascular Electrophysiology to the Tenet mapper. Per-account HL7 field mapping lives in each `oru.py`/`ack.py`; not documented field by field here (unknown, deferred).

## 3. File interfaces (S3, outbound and inbound)

Bucket: `PROCESSED_BUCKET` (name is env, value not read). Keys are written as `<prefix><name>` (`src/utils/aws.py:create_hl7_file`):

| Prefix | Content | Written by |
|---|---|---|
| `adts/` | Received ADT/ORM text, `<controlId>.hl7` | `adt_parse` (`adt.py:102`) |
| `ehr_orus/` | Received inbound ORU, `<controlId>.hl7` | `oru_parse` (`oru.py:245`) |
| `acks/` | Received ACK, `<controlId>.hl7` | `ack_parse` (`ack.py:26`) |
| `orus/` | Generated ORU: `<reportId>-<status|F>.hl7` (`-CSR` for connectivity reports; `-IDCO` suffix for IDCO) | `oru_create`, `idco_oru` |
| `dfts/` | Generated DFT, `<reportId>.hl7` | `dft_create` |
| `pdfs_with_cover_page/` | Merged PDF (cover page + body), only for accounts that upload | prefix defined (`src/config.py:20`); the uploader is `unknown` (accountHandler `utils.py` modules import `upload_file`; actual call not located) |

Reads: `reports.file_path` / `hf_file_path` and `report_cover_pages.cover_page_URL` from `PROCESSED_BUCKET` (`src/utils/aws.py:download_file_from_s3`, downloaded to `BASE_PATH`); `reports.hl7_file_path` from a per-manufacturer bucket via `MANUFACTURER_BUCKET_MAPPING` (JSON), with Glacier/Deep Archive restore (`Expedited`, 3 days) initiated on demand and an error "retry later" returned (`src/utils/aws.py:get_file_content_with_restore`). Who picks up the written `orus/`, `dfts/` files and delivers them to EMRs is `unknown` (delivery side lives outside this repo; likely `client-ehr-hl7-export`, unverified).

## 4. Database interface (shared MongoDB)

Connection: `DB_URI` / `DATABASE_NAME` from Secrets Manager; singleton `pymongo` client (`src/database/connection.py`). Collections (`src/utils/constants.py`, `src/database/query.py`):

| Collection | Access | Use |
|---|---|---|
| `reports` | read | `get_report`: billable, file_path, billing_code, hf_file_path, diagnosis_code, ehr_notes, transmission_type, device_category, signed_at, manufacturer, hl7_file_path, ... (`query.py:128-150`) |
| `report_cover_pages` | read | `cover_page_URL` by `reportId` (`query.py:114-125`) |
| `hl7jobs` | read | job by `report_id` with `type` in {`ORU_R01`, `DFT_P03`, `IDCO_ORU_R01`} or missing type (`query.py:157-179`). Never written here |
| `report_notes` | read (aggregation) | `query.py:218` |
| `accounts` | read | clinic info, `idtf`, `timezone`, aliases (`query.py:31-90`) |
| `users` | read | looks up user named `EVOKE AUTOMATED NOTES` (`src/database/user.py:5-19`) |
| `manufacturers`, `devices` | read ($lookup / aggregation) | device billing info and fuzzy model match (`query.py:501-596`) |
| `patients` | read, write | match by name/DOB/MRN, update (`$set`), or insert when `upsert=True` from an inbound ORU; patient/device discrepancy returns an error and Slack notice instead of writing (`query.py:255-370`) |
| `patient_diagnoses` | read, write | upsert by `patientId` (`query.py:490-496`) |
| `sequencers` | read, write | increments `{name: "patients"}` for new patient `evoke_id` (`query.py:350`) |
| `adts` | read, write | insert/update keyed by mrn, account, transmission_type (`remote` default, `inOffice` for ORU) and csn or order_number (`query.py:372-448`); duplicate check by account and controlID |
| `adts_book_keeping` | read, write | used instead of `adts` when `patient_update_only` (`query.py:374`) |
| `acks` | write | `{path}` of stored ACK (`query.py:453-458`) |
| `tasks` | write | "NEW PATIENT / COMPLETE ONBOARDING PROTOCOL" automated task after inbound ORU (`query.py:599-605`, `oru.py:35,226`) |

No transactions or index creation found (grep). Collections co-written by other Evoke repos: `patients`, `sequencers`, `tasks`, `reports` readers (per `system/repository-relationships.yaml:109,232`). Migrations: none.

## 5. Third-party integrations

- Slack incoming webhook (`LF_SLACK_URL` from secret key `SLACK_URL`): POST JSON `{text}` with function name, message or traceback and a CloudWatch log-stream URL; skipped in local mode (`src/utils/slack.py`). Authentication is the secret webhook URL (value not recorded). Used for errors and for new-clinic or patient-discrepancy notices.
- Client EMR/EHR systems: HL7 v2 over an unknown transport. Inbound messages arrive as Lambda `value`; outbound HL7 is written to S3. This repo makes no direct network call to an EMR (see dependencies.md).
- AWS Secrets Manager (`get_secret_value`) and S3 as above. Portal link emitted into HL7: `<BASE_URL>patient/report/<reportId>` (Covenant, Tenet) (`src/accountHandler/covenant/utils.py:18`).

## 6. Not present

REST/GraphQL endpoints, SQS/SNS/EventBridge producers or consumers, scheduled triggers, MLLP listeners, SFTP clients, Lambda-to-Lambda invocation (`BILLING_LAMBDA_ARN` loaded, never used). Checked: grep of `src`, `hl7`, `pdf` and `bitbucket-pipelines.yml`.

## 7. Unknowns

- Lambda trigger, invoker identity and authorization.
- Delivery mechanism from S3 `orus/`/`dfts/` to client EMRs, and receipt path for inbound ADT/ORU/ACK into the Lambda.
- Where `pdfs_with_cover_page/` uploads occur.
- Per-account HL7 segment/field mappings (deferred, large; see `src/accountHandler/<account>/`).
- Whether `ORU_CREATION` PDF output is attached inline (base64) or by S3 reference for each account (`generate_content_for_base64` vs `get_report_with_cover_page`, `oru.py:140-157`): account dependent.
