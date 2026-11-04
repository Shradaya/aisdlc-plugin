# Checklist: personal data (PII)

For projects whose `data.sensitivity` is `pii`: names, contact details, identifiers, locations, anything that identifies a person. Used by `security-reviewer` on top of its general review. These are review prompts, not a compliance certification.

Report only what is actually in the diff. Never quote real data you come across; give the location.

1. **Logging and telemetry.** Personal data in logs, metrics, traces, analytics events and error reports, including in `catch` blocks and debug statements.
2. **Responses and errors.** Responses or errors returning more fields than the caller needs; other users' identifiers; stack traces or query text reaching a client.
3. **Authorization.** New or changed routes, queries and jobs decide who may see or change a person's data (ownership and role checks), and never trust identifiers or roles supplied by the client.
4. **Injection and validation.** Unvalidated input reaching a query, path or command; missing schema validation.
5. **Outbound data.** Personal data in emails, notifications, third-party calls and exports; payloads carrying more than an identifier; recipients wider than intended.
6. **Secrets.** Hardcoded credentials; secrets outside the project's secret store.
7. **Client side.** Personal data in local storage, URLs and query strings, analytics payloads.
8. **Copies and fixtures.** Data copied to a new store, cache or file without the same protections; real-looking personal data in tests, fixtures, screenshots or documentation (use synthetic data).
9. **Minimization and retention.** New fields that the requirement does not need; data kept past its purpose; no deletion or export path for what was added.
