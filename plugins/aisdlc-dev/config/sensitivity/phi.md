# Checklist: protected health information (PHI)

For projects whose `data.sensitivity` is `phi`: patient identity, diagnoses, device readings, reports, appointments, contact details, anything that links a person to their health. Used by `security-reviewer` on top of its general review. These are review prompts, not a compliance certification.

Report only what is actually in the diff. Never quote real data you come across; give the location.

1. **Logging.** Patient names, dates of birth, record numbers, contact details, readings, whole request bodies or database documents written to logs, metrics or traces, including in `catch` blocks and debug statements.
2. **Responses and errors.** Responses or error messages that return more than the caller needs (whole records, internal identifiers of other accounts, password hashes, tokens); stack traces or query text reaching a client; errors that bypass the shared error handler.
3. **Authorization, not only authentication.** Every new or changed route, query, job or message consumer decides *who* may see or change the data: role allow-lists, scoping to the caller's clinic or account, ownership checks on identifiers taken from the request (insecure direct object references), client-supplied account or role values trusted as given.
4. **Injection and validation.** Unvalidated input reaching a query (operator injection through objects in a request body or query string, `$where`, string-built SQL), regular expressions built from user input, path traversal, missing schema validation.
5. **Outbound data.** Sensitive content in email, SMS, chat or notification bodies and subjects; queue or event payloads carrying more than an identifier; socket or pub/sub events broadcast to a wider audience than the intended user; storage objects without restricted access; pre-signed links with long expiry; file exports and transfers (SFTP, HL7, CSV, PDF) and who can trigger or read them.
6. **Secrets.** Hardcoded keys, URLs with embedded credentials, secrets read from a file or environment variable where the project uses a secret store.
7. **Client side.** Sensitive data in local or session storage, URLs and query strings, analytics or error-reporting payloads; tokens stored where script can read them; rendering unescaped HTML from data.
8. **Copies, fixtures and screenshots.** Data copied somewhere new (a queue, bucket, table, cache, log file) without the same protections; real-looking patient data in tests, fixtures, seed scripts, screenshots or documentation. Test data must be synthetic.
9. **Minimum necessary and retention.** New fields collected or stored that the requirement does not need; data kept longer than its purpose; no way to delete or restrict what was added.
10. **Auditability.** Reads or changes of patient data that should leave an audit record and do not, or audit records that themselves contain the data.
