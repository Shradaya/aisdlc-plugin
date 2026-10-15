---
repository: client-emr-hl7-parser
analyzed_commit: 542997c1b6c48c4e410090b6d49e92e02cd5c8ba
analyzed_branch: main
analyzed_at: 2026-10-15T08:46:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [main.py, src/config.py, src/eventHandler/__init__.py, src/eventHandler/contants.py, src/accountHandler/__init__.py, src/database/connection.py, src/utils/constants.py, requirements.txt, bitbucket-pipelines.yml, readme.md, .env-example, .gitignore]
---

# client-emr-hl7-parser: Overview

## Identity (Phase A)

| Item | Value | Status |
|---|---|---|
| Name | `client-emr-hl7-parser` (remote slug). readme.md titles it "Manufacturer HL7 Parser (Evoke Manufacturer Data Pipeline)"; deploy zips are `uat-client-emr.zip` and `prod-client-emr.zip` (`bitbucket-pipelines.yml`). | observed |
| Local path | `${AISDLC_REPOS_ROOT}/client-emr-hl7-parser` | observed |
| Remote | Bitbucket, workspace `evoke-medical-care` (`git remote -v`, SSH form) | observed |
| Branch / commit | `origin/main` at `542997c1b6c48c4e410090b6d49e92e02cd5c8ba` ("Merged in EL-5353 (pull request #367)"). The earlier analysis (2026-10-09) was of branch `EL-5353` at `b9615126ee17c4e2583e08ac81faaa9d12c63005`, one commit ahead of `main` 6e4d67e ("EL-5353: Add Baptist Heart & Vascular Electrophysiology to Tenet mapper", touching `src/eventHandler/contants.py`); that PR is now merged, and `git diff b961512 origin/main` is empty, so the knowledge below still describes `main`. 456 commits in history at that analysis. | observed |
| Type | Python AWS Lambda (not a long-running service). Handler `main.lambda_handler(event, context)`. Handler string configured on AWS is `unknown` (no infra in repo; readme says `main.lambda_handler`). | observed |
| Language / runtime | Python. Lambda runtime version `unknown` (not declared). Code uses `X | None` and `tuple[...]` syntax and `zip(strict=)`, so Python >= 3.10 (`src/database/query.py`, `src/eventHandler/dft.py`). | inferred |
| Key libraries | `hl7apy` 1.3.5, `pymongo` 4.17.0, `boto3` 1.43.52, `pymupdf` 1.28.0, `requests` 2.34.2, `Levenshtein` 0.27.3, `RapidFuzz` 3.14.5, `python-dateutil` (`requirements.txt`). `mongoengine` 0.29.3 is pinned but never imported (`git grep mongoengine -- '*.py'` returned nothing). | observed |
| Size | 120 tracked files; about 2,845 lines in `main.py`, `hl7/`, `src/database`, `src/utils`, `src/eventHandler` combined (account handlers excluded). | observed |
| Tests | None found (no test files, no pytest/unittest references). | observed |

## Purpose (observed in code)

Bidirectional HL7 v2 bridge between the Evoke portal (MongoDB) and client EMR systems (hospital/clinic accounts):

- Inbound: parses HL7 ADT, ORM and ORU messages and ACKs from clients, upserts patients and ADT records in MongoDB, stores raw HL7 in S3, returns an HL7 ACK (`src/eventHandler/adt.py`, `oru.py`, `ack.py`).
- Outbound: for a given report id, builds an ORU_R01 (report with PDF, cover page merged via pymupdf), DFT_P03 (billing/charges) or IDCO ORU HL7 message from MongoDB data, writes it to S3 (`src/eventHandler/oru.py`, `dft.py`, `idco_oru.py`).
- Sends Slack notifications on errors and on unknown clinics (`src/utils/slack.py`).

What delivers messages to the Lambda and what picks up the generated HL7 files from S3 is `unknown` (no infrastructure or transport code in this repo; checked `main.py`, `src/`, `bitbucket-pipelines.yml`).

## Event types (dispatch)

`main.lambda_handler` reads `event['eventType']` and `event['value']` and calls `EVENT_TYPE_MAPPER[eventType]` (`src/eventHandler/__init__.py`):

| eventType | Function | `value` is | Output |
|---|---|---|---|
| `ORU_CREATION` | `oru.oru_create` | report id | `response.message = {hl7_path, pdf_path}`; HL7 saved to `orus/` in S3 |
| `ADT_PARSING` | `adt.adt_parse` | raw HL7 text (file path when run locally) | HL7 ACK text in `message`; optional `adt_id`. Also routes ORU_R01 to `oru.oru_parse`. |
| `ACK_PARSING` | `ack.ack_parse` | raw HL7 ACK text | ACK code in `message`; file to `acks/`; row in `acks` |
| `DFT_CREATION` | `dft.dft_create` | report id | DFT_P03 HL7 to `dfts/` |
| `IDCO_ORU_CREATION` | `idco_oru.oru_create` | report id | IDCO ORU HL7 |

Response shape: `{status: 200|202, message, error?, adt_id?}`; status 202 on error (`main.py`). A missing or unknown `eventType` raises KeyError, caught by the generic handler (Slack error notification).

CLI: `python main.py --eventType <type> --value <value>` (`main.py`, `readme.md`). Locally `.env` is read and Slack is skipped (`src/config.py`, `src/utils/slack.py`).

Supported inbound message types: ADT_A02, A03, A04, A08, A31, ORM_O01, ORU_R01 (`ADT_SUPPORTED_MESSAGE_TYPES`, `ORU_SUPPORTED_MESSAGE_TYPES` in `src/eventHandler/contants.py`).

## Per-account handlers (`src/accountHandler/`)

Canonical facility keys (`src/accountHandler/__init__.py`, aliases in `APPLICATION_FACILITY_MAPPER`):

| Facility key | Directory | ORU | ACK | DFT | IDCO ORU |
|---|---|---|---|---|---|
| PUEBLO | `uch_cupid` (shared with UCH) | yes | yes | yes | yes |
| UCH | `uch_cupid` and `uch` dir exists | yes (`uch_cupid`) | yes | yes | yes |
| CENTRA | `centra` | yes | yes | no | no |
| CCH | `cch` | yes | yes | no | no |
| ASPEN | `aspen` | yes | yes | no | no |
| DENVER HEALTH | `denver` | yes | yes | yes | no |
| BOND | `bond` | yes | yes | no | no |
| TOLEDO | `toledo` | yes | yes | yes | no |
| TJ SAMSON | `tj_samson` | yes | yes | no | no |
| GRAND HEART | `grand_heart` | yes | yes | yes | no |
| TENET | `tenet` | yes | yes | no | no |
| CAET, Parkway Cardiology Associates, Knoxville Heart Group | `covenant` (shared) | yes | yes | no | no |
| COVENANT | `covenant` | not in ORU map | ack only | no | no |

Note: `src/accountHandler/uch/` has files but `uch` imports in `__init__.py` come from `uch_cupid`; whether `uch/` is dead code is `unknown` (not imported by `__init__.py`; other importers not checked exhaustively).

## Deployment (summary)

`bitbucket-pipelines.yml` has two branch pipelines: `lf-uat` (deployment "User Acceptance Testing") and `main` (deployment "Production"). Each assumes an AWS role via Bitbucket OIDC, strips `.gitignore`, the pipeline file and `.git`, zips the working tree, copies it to S3, then `aws lambda update-function-code --publish`. No dependency install or test step: how `hl7apy`, `pymongo` and other packages reach the Lambda is `unknown` (layer or prebuilt environment assumed). Details in `build-release.md` if written.

## Entry points

- `main.py` `lambda_handler`
- `main.py` `__main__` CLI (`--eventType`, `--value`)

## Unknowns

- Lambda runtime version, memory, timeout, IAM role, VPC, trigger/event source, who consumes the generated HL7 in S3 (checked repo root, pipeline).
- Whether `src/accountHandler/uch/` is used.
- Billing semantics of codes (only mechanics are in code).
