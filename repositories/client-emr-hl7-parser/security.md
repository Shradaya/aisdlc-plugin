---
repository: client-emr-hl7-parser
analyzed_commit: b9615126ee17c4e2583e08ac81faaa9d12c63005
analyzed_at: 2026-10-09T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/config.py, src/utils/slack.py, src/utils/aws.py, src/database/connection.py, src/eventHandler/ack.py, src/eventHandler/adt.py, main.py, bitbucket-pipelines.yml, .env-example, .gitignore]
---

# client-emr-hl7-parser: Security baseline

Names only; no secret values recorded.

## Authentication and authorization

- No inbound authentication logic in this repo: the Lambda trusts `event['eventType']` and `event['value']` (`main.py`). Who may invoke it (IAM, event source) is `unknown` (no infra definition).
- Sender identity for HL7 is derived from message content (MSH sender clinic, receiving application) via `APPLICATION_FACILITY_MAPPER`; no signature, mTLS or shared-secret check in code (`src/eventHandler/adt.py`, `oru.py`). Unknown clinics are accepted, stored to S3, and trigger a Slack notice plus a default ACK (`adt.py`, `oru.py`).
- AWS access uses the Lambda execution role (default boto3 credential chain; `boto3.client("s3")` in `src/utils/aws.py`). Role permissions `unknown`.

## Secrets and configuration

| Name | Source | Use |
|---|---|---|
| `SM_REGION`, `SM_NAME` | Lambda env | Secrets Manager region and secret id (`src/config.py`) |
| `DB_URI`, `DATABASE_NAME` | Secrets Manager JSON | MongoDB connection |
| `SLACK_URL` (stored as `LF_SLACK_URL`) | Secrets Manager JSON | Slack webhook for dev team |
| `EVOKE_SLACK_URL` | Secrets Manager JSON (optional) | Loaded; no usage found elsewhere in code |
| `BASE_PATH`, `PROCESSED_BUCKET` | Lambda env (required) | Temp dir, main S3 bucket |
| `BASE_URL`, `BILLING_LAMBDA_ARN`, `MANUFACTURER_BUCKET_MAPPING` | Lambda env (optional) | Report URL prefix; billing Lambda ARN (loaded, not used in code); manufacturer-to-bucket JSON |
| `.env` keys for local runs | `.env-example`: `DB_URI`, `DATABASE_NAME`, `LF_SLACK_URL`, `EVOKE_SLACK_URL`, `region_name`, `SecretId`, `BASE_PATH`, `BILLING_LAMBDA`, `PROCESSED_BUCKET`, `ERROR_PATH`, `TEST_PDF` | Local only |
| Pipeline: `AWS_REGION`, `AWS_ROLE_ARN`, `DEV_LAMBDA_RESOURCE_BUCKET`, `UAT_LAMBDA_NAME`, `PROD_LAMBDA_RESOURCE_BUCKET`, `PROD_LAMBDA_NAME`, `BITBUCKET_STEP_OIDC_TOKEN` | Bitbucket deployment variables | Deploy |

- `.env` and `.vscode/launch.json` are gitignored (`.gitignore` lines 54-55). No hard-coded credentials found by a pattern grep for `secret|password|token =` in `*.py`. A full secret scan was not run.
- CI uses OIDC role assumption (no static AWS keys in pipeline). The web identity token is written to a file in the build dir (`bitbucket-pipelines.yml`), and `echo $BITBUCKET_STEP_OIDC_TOKEN` writes it to a file, not to logs.

## Findings and risks (observed)

1. PHI in logs and notifications: `ack_parse` logs the full ACK text and `print(info)`; parse failures log exceptions; Slack error messages include tracebacks and patient discrepancy text containing evoke_id, device model/serial and control id (`src/eventHandler/ack.py`, `src/database/query.py`, `src/utils/slack.py`). Patient names/MRN not directly put in Slack text in the paths read; full verification across all account handlers not done.
2. Raw HL7 messages (patient demographics, insurance, diagnoses) are written to local temp `BASE_PATH` and S3 under `adts/`, `ehr_orus/`, `acks/`. Encryption, bucket policy and retention are `unknown` (not defined here).
3. `src/config.py` bare `except:` falls back to Secrets Manager on any `.env` read error; a malformed `.env` line (`split('=')` with extra `=` in a value) would silently switch modes. DB URIs containing `=` would break local parsing.
4. Slack POST has no timeout or status check (`requests.post(...)` printed) (`src/utils/slack.py`).
5. Mongo queries use dict filters built from message fields (names via `case_insensitive` regex helper, `src/database/query_utils.py`); regex escaping was not verified (`unknown`; read only `case_insensitive` signature, not body). Treat as potential NoSQL/regex injection surface.
6. `requirements.txt` pins dates and versions (for example certifi 2026.6.17); no dependency scanning in pipeline.
7. Production deploys on every push to `main` with no test or approval step in the pipeline file (approvals may exist in Bitbucket settings: `unknown`).
8. Deploy zip includes the whole tree except `.gitignore`, pipeline file and `.git`; `src/utils/testPDF.pdf` and `.env-example` ship in the artifact.

## Not applicable or unknown

- Encryption in transit to MongoDB: depends on `DB_URI` (`unknown`).
- CORS, sessions, rate limiting: not applicable (no HTTP surface in this repo).
- Audit logging beyond CloudWatch logger (`src/utils/logger.py`): none found.
