---
repository: manufacturer-hl7-parser
analyzed_commit: e185ff36fe03c649cd7e9750e895c8c43f857c43
analyzed_at: 2026-10-01T17:37:23Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [main.py, src/processor.py, src/constants.py, src/utils/aws.py, hl7/parser.py, hl7/extractor/**]
---

# Interfaces (Phase E)

## Inbound

1. **S3 event**: `Records[0].s3.bucket.name` and `.object.key` (key passed through `unquote_plus`). Only the first record is read (`main.py:106-119`).
2. **SQS event**: `Records[0].body` is a JSON string or dict holding `{"Records":[{"s3":...}]}`; every inner record is processed in a loop (one failure aborts the rest). The developer states SQS messages come from a DLQ; `DELAY_SQS` replays are the same shape.
3. **CLI**: `python main.py --path <file.hl7>`; fake S3 event with empty bucket; requires a local `.env`.

### File format and message structure

- Only `.hl7` is intended; `SUPPORTED_FORMATS = ('hl7')` is a string so the check is a substring test (see `security.md`). An unsupported extension gets a Slack message and no copy to the error path.
- `load_message` decodes UTF-8 with an ISO-8859-1 fallback [analyst finding], converts line endings to `\r`, drops lines containing `MDT_EPISODES_EPISODE_EXTENDEDDATA_NAME` / `..._VALUE`.
- `MSH-9` must be `ORU^R01`, otherwise the file is copied to the error path and Slack is alerted. `MSH-4` sending facility is mapped through `manufacturers.facility` to Abbott, Boston Scientific, Medtronic or Biotronik. `MSH-5` account name (falls back to `MSH-6` when empty or containing "evoke"), `MSH-7` interrogation date, `MSH-10` control id (deduped against `reports.oruControlId`).
- Patient fields: `PID-5` name (Biotronik fallback in `PID-3`), `PID-7` DOB, `PID-8` gender, `PID-2.1` MRN, `PID-18.1` CSN, `PID-11/13/14` address and phones; `NTE-3` notes.
- `OBX-3` identifiers (~75 MDC/MDT/BIO codes) dispatch through the `ACTIONS` table in `hl7/extractor/obxMapper.py`. PDFs arrive as base64 in `OBX-5`; a summary report is detected from `OBX-3.5` or a Medtronic encounter-summary code.

## Outbound

- **PDFs**: `s3://PROCESSED_BUCKET/<manufacturer>/<clinic>/<YYYY-MM-DD>/<report_name>.pdf` plus `<report_name>_hf.pdf` when an HF billing code applies. Spaces in names become `-`. `report_name` contains patient family/given name, device type and control id.
- **Error files**: copied to `<ERROR_PATH><YYYY-MM-DD>/<filename>` in the input bucket for parse failures, non-ORU messages and extraction failures; not for unsupported extension or `DeviceNotInDB`. Duplicate control-id files are also copied there (architecture analyst).
- **Queues, Lambda, Slack**: payloads in `dependencies.md`.
- **MongoDB**: collections written/read listed in `data-model.md`. Report documents expose `hl7_file_path`, `file_path`, `hf_file_path`, `oruControlId`, `summary_report_flag` to other readers.

## Error behavior seen by callers

Parsing/type errors: Slack alert and success (no retry). `ReportNotFound`, `DuplicateControlID`, `PatientDeviceNotMatching`, `DeviceNotInDB`: success (silent). All others: Slack alert with traceback and re-raise, so the invocation fails and the trigger's retry/DLQ policy (unknown) applies.

## Unknowns

IAM, queue settings, bucket names (values), Lambda handler string (the code defines `main.lambda_handler`).
