---
repository: client-emr-hl7-parser
analyzed_commit: b9615126ee17c4e2583e08ac81faaa9d12c63005
analyzed_branch: EL-5353
analyzed_at: 2026-10-09T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [requirements.txt, main.py, bitbucket-pipelines.yml, readme.md, src/config.py, src/database/connection.py, src/database/query.py, src/database/user.py, src/utils/aws.py, src/utils/slack.py, src/utils/constants.py, src/eventHandler/__init__.py, src/eventHandler/idco_oru.py, src/eventHandler/oru.py, src/eventHandler/adt.py, src/accountHandler/constants.py, src/accountHandler/covenant/utils.py]
---

# Dependencies (Phase D)

Repository location: `${AISDLC_REPOS_ROOT}/client-emr-hl7-parser`. A Python AWS Lambda (`main.lambda_handler`) that exchanges HL7 v2 messages with client EMR/EHR systems. The readme title still says "Manufacturer HL7 Parser" (copied from the sibling repo; `readme.md:1`). Analyzed HEAD is one commit ahead of `main` (6e4d67e). `.env-example` could not be read by the analyst tooling (access denied); its keys are `unknown` beyond what `src/config.py` consumes.

## Packages (`requirements.txt`, exact pins; observed)

| Package | Pin | Class | Use / evidence |
|---|---|---|---|
| `boto3` | 1.43.52 | direct | S3 (`src/utils/aws.py:7`), Secrets Manager (`src/config.py:4,40-44`) |
| `botocore` | 1.43.52 | direct (imported) | `from botocore.exceptions import ClientError`, `src/utils/aws.py:4` |
| `pymongo` | 4.17.0 | direct | `src/database/connection.py:1`; `bson.ObjectId` comes with it (`src/database/query.py`) |
| `mongoengine` | 0.29.3 | unused (inferred) | pinned; no import found by grep of `src`, `hl7`, `pdf`. Not verified at runtime |
| `hl7apy` | 1.3.5 | direct | HL7 parse/create (`hl7/parser.py:1`, `hl7/creator/hl7Creator.py:1`, `hl7/__init__.py:1`); `hl7/` is a local package |
| `pymupdf` | 1.28.0 | direct | imported as `fitz`: `pdf/utils.py:1`, `src/utils/pdf.py:1` (cover-page merge) |
| `Levenshtein`, `python-Levenshtein`, `RapidFuzz` | 0.27.3 / 0.27.3 / 3.14.5 | `RapidFuzz` direct (`src/eventHandler/utils.py:1`, used by `find_best_match`, `src/eventHandler/oru.py:87-95`); `Levenshtein`/`python-Levenshtein` no import found (unused or RapidFuzz-adjacent, inferred) |
| `requests` | 2.34.2 | direct | Slack webhook POST, `src/utils/slack.py:3,16` |
| `python-dateutil` | 2.9.0.post0 | direct | `src/utils/date.py:2,4` |
| `s3transfer`, `jmespath`, `urllib3`, `certifi`, `charset-normalizer`, `idna`, `six`, `dnspython` | pinned | indirect | transitive of boto3, requests, pymongo |

The local package `hl7/` shadows the PyPI `hl7` distribution name; `hl7apy` is the third-party HL7 library. Test-only and build-only packages: none declared (no test directory, no dev requirements). Checked: `git ls-files`, `requirements.txt`.

## Runtime and build

- Python version: unknown in config. Checked: no `runtime.txt`, `pyproject.toml`, Dockerfile. Committed `__pycache__` files in `src/accountHandler/` are `cpython-311` (suggests 3.11 locally; Lambda runtime is configured outside the repo).
- Packaging (`bitbucket-pipelines.yml`): only `lf-uat` and `main` branches deploy. The pipeline zips the repo root (after removing `.gitignore`, `bitbucket-pipelines.yml`, `.git`) to `uat-client-emr.zip` / `prod-client-emr.zip`, copies to S3, then `aws lambda update-function-code --publish`. No `pip install` step: third-party packages must come from a layer or are otherwise supplied; `unknown`. No QA branch step. Pipeline image `public.ecr.aws/c7j4d3u2/build-agent-image:latest` (unpinned). Auth by Bitbucket OIDC.
- Pipeline variable names (values not read): `AWS_REGION`, `AWS_ROLE_ARN`, `DEV_LAMBDA_RESOURCE_BUCKET`, `PROD_LAMBDA_RESOURCE_BUCKET`, `UAT_LAMBDA_NAME`, `PROD_LAMBDA_NAME`.
- Local run: `python main.py --eventType <type> --value <value>` with a `.env` (`readme.md`, `main.py:46-65`). Local mode reads HL7 text from a file path (`read_local_file(event['value'])` when `ENV_VARS.local`, `src/eventHandler/adt.py:60`).

## Configuration (names only)

`src/config.py` decides at import: local `.env` (every `KEY=value` line; a value containing `=` breaks the loader) or deployed mode.

Deployed env vars: `SM_REGION`, `SM_NAME` (Secrets Manager secret id), `BASE_PATH` (required, temp dir prefix), `PROCESSED_BUCKET` (required, S3), `BASE_URL` (optional, prefix of portal report links), `BILLING_LAMBDA_ARN` (optional, loaded into `ENV_VARS.BILLING_LAMBDA`; no use found, see unknowns), `MANUFACTURER_BUCKET_MAPPING` (optional JSON string: manufacturer name -> S3 bucket, `src/eventHandler/idco_oru.py:31`).

Secret JSON keys: `DB_URI`, `DATABASE_NAME`, `SLACK_URL` (stored as `ENV_VARS.LF_SLACK_URL`), `EVOKE_SLACK_URL` (optional, no use found).

Hard-coded S3 key prefixes (not env): `orus/`, `adts/`, `acks/`, `dfts/`, `ehr_orus/`, `pdfs_with_cover_page/` (`src/config.py:15-20`).

## External systems and internal services

| Dependency | Class | Direction | Evidence |
|---|---|---|---|
| MongoDB (`DB_URI`/`DATABASE_NAME`; shared with other Evoke repos, see below) | external-system | read/write | `src/database/connection.py` |
| AWS S3 bucket `PROCESSED_BUCKET` (HL7 files, PDFs) | external-system | read/write | `src/utils/aws.py:14-17,30-43` |
| AWS S3 manufacturer buckets from `MANUFACTURER_BUCKET_MAPPING` (read; Glacier/Deep Archive restore requested) | external-system | read | `src/utils/aws.py:94-134`, `src/eventHandler/idco_oru.py:193-195` |
| AWS Secrets Manager | external-system | read | `src/config.py:40-48` |
| Slack incoming webhook (`LF_SLACK_URL`) plus CloudWatch log deep link | external-system | outbound | `src/utils/slack.py` |
| Bitbucket Pipelines, Lambda, S3 (deploy) | build-only | n/a | `bitbucket-pipelines.yml` |
| Client EMR/EHR systems (Epic, Cerner, etc., named in `APPLICATION_FACILITY_MAPPER`) | external-system | indirect | `src/eventHandler/contants.py:1-62`. No SFTP, MLLP, socket or HTTP client to EMRs exists in this repo (grep of `src hl7 pdf` for requests/socket/sftp/paramiko: only Slack). Transport to EMRs is `unknown` and lives in the caller |
| Lambda invoker (caller of `eventType` events) | internal-repository (unestablished) | inbound | `main.py:8-14`. Caller identity `unknown`; see relationships |

Not found: SQS, SNS, Lambda `invoke` client, SFTP, MLLP. Checked by grep for `sqs|invoke|lambda_client|sftp|paramiko|socket`.

## Candidate cross-repository edges (for the caller to confirm)

1. client-emr-hl7-parser -> shared MongoDB (kind `database`), co-owner with `rest-api-evoke` and `manufacturer-hl7-parser`. Evidence: identical `DB_URI`/`DATABASE_NAME` secret keys (`src/config.py:46-47`); collections `reports`, `report_cover_pages`, `hl7jobs`, `report_notes`, `patients`, `sequencers`, `devices`, `manufacturers`, `accounts`, `users`, `tasks` (`src/utils/constants.py`). `rest-api-evoke` owns `hl7jobs`, `accounts`, `users` per `system/repository-relationships.yaml:232`; `manufacturer-hl7-parser` writes `patients`, `reports`, `report_notes`, `sequencers`, `devices`, `tasks` (same file, line 109). The shared `sequencers` document `{name: "patients"}` is incremented by this repo (`src/database/connection.py:get_next_sequence_value`, `src/database/query.py:350`). Direction: read and write. Confidence high for the shared database, medium for ownership.
2. rest-api-evoke -> client-emr-hl7-parser (kind `event`/`file`, indirect). `rest-api-evoke` creates `hl7jobs` (types `ORU_R01`, `DFT_P03`, `IDCO_ORU_R01`) and publishes `{hl7JobId}` to SNS consumed by external `client-ehr-hl7-export` (`system/repository-relationships.yaml:289-296`). This repo reads `hl7jobs` by `report_id` and `type` of `ORU_R01` / `IDCO_ORU_R01` (`src/eventHandler/oru.py:24`, `src/eventHandler/idco_oru.py:25`, `src/database/query.py:157-179`). The Lambda is plausibly invoked by `client-ehr-hl7-export` (unregistered); not proven. Note: this repo's DFT handler calls `get_hl7jobs` through its own `get_required_collections_from_db`; the DFT jobs are read with type constant `DFT_P03` (`src/eventHandler/dft.py:20`).
3. manufacturer-hl7-parser -> client-emr-hl7-parser (kind `file`/`database`, indirect). Manufacturer parser writes `reports.file_path`, `hf_file_path`, `hl7_file_path` and PDFs; this repo downloads `file_path`/`hf_file_path`/`cover_page_URL` from `PROCESSED_BUCKET` and `hl7_file_path` from the manufacturer buckets (`src/eventHandler/oru.py:57-65`, `src/eventHandler/idco_oru.py:185-195`). The Lambda writes nothing back to `reports`. Direction: manufacturer-hl7-parser produces, this repo consumes.
4. client-emr-hl7-parser -> evoke-portal-front-end (kind `third-party`/link, weak). Builds report URLs `<BASE_URL>patient/report/<reportId>` embedded in HL7 for Covenant and Tenet (`src/accountHandler/covenant/utils.py:18`, `src/accountHandler/tenet/utils.py:18`, `src/accountHandler/constants.py:20`). Route ownership by the portal front end is `unknown` (not checked in the portal repo). Direction: this repo -> portal, link only.
5. patient-billing-schedule: no edge. `BILLING_LAMBDA_ARN` is loaded (`src/config.py:33`) but no consumer of `ENV_VARS.BILLING_LAMBDA` exists (grep). Record as unknown, not as an edge.

## Unknowns

- Python runtime version and how third-party packages get into the Lambda zip (no pip step in the pipeline).
- Whether `Levenshtein`/`python-Levenshtein` are used at all (no import found).
- Purpose of `BILLING_LAMBDA_ARN` and `EVOKE_SLACK_URL` (loaded, unused).
- Identity of the Lambda caller (SNS subscriber, gateway, or scheduler) and the transport used to reach EMRs.
- QA environment (no `lf-qa` pipeline step).
