# Checklist: financial data

For projects whose `data.sensitivity` is `financial`: payments, accounts, balances, invoices, card or bank details, anything that moves or records money. Used by `security-reviewer` on top of its general review. These are review prompts, not a compliance certification.

Report only what is actually in the diff. Never quote real data you come across; give the location.

1. **Card and bank data.** Full card numbers, security codes, bank account details, or tokens stored, logged, returned in a response or put in an event. Card data should go to the payment provider and come back as a token.
2. **Logging.** Amounts tied to identities, account numbers, tokens or whole payloads in logs, metrics and error reports.
3. **Authorization on money movement.** Every route, job or consumer that creates, changes, refunds or reads a transaction or balance checks *who* may do it and on *which account*; no client-supplied account, amount currency or role trusted as given.
4. **Integrity of amounts.** Arithmetic on money in floating point; rounding or currency handling that can lose or create value; negative or zero amounts, overflow, and mismatched currencies accepted.
5. **Idempotency and concurrency.** Operations that can be repeated (retries, duplicate deliveries, double submission) without charging or crediting twice; read-modify-write on balances without a transaction or constraint.
6. **Audit trail.** Money movements and changes to financial records leave a tamper-evident record, and the record does not itself contain card or bank data.
7. **Injection and validation.** Unvalidated input reaching a query or a downstream payment call; missing schema validation on amounts and identifiers.
8. **Outbound data.** Financial data in emails, notifications, exports and third-party calls beyond what is needed.
9. **Secrets.** Payment-provider keys and webhook secrets in code or outside the project's secret store; webhook payloads accepted without verifying their signature.
10. **Copies and fixtures.** Real account or card data in tests, fixtures, screenshots or documentation (use the provider's test values or synthetic data).
