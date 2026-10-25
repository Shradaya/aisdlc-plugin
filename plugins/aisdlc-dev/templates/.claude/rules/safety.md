# Safety rules

- Production access is disabled: no production deploys, no production database writes, no destructive infrastructure operations.
- Never force-push, rewrite shared history, delete `main`, hard-reset protected branches, auto-resolve conflicts on `main`, or discard developer changes.
- Protected paths: `.git/`, `credentials/`, `secrets/`, production configuration, workspace credentials, private key files.
- Secrets are never placed in task artifacts, commits, audit logs, Jira comments or product docs. Do not print environment variables or secret values; refer to names only.
- Integration credentials come from environment variables only: `JIRA_EMAIL`, `JIRA_API_TOKEN`, `BITBUCKET_EMAIL`, `BITBUCKET_API_TOKEN` (names configured in `config/integrations.yaml`). Check that they are set; never print, log, commit or paste their values. The hook blocks printing the API tokens.
- `bypassPermissions` is not an aisdlc mode. Hooks in the plugin's `hooks/` enforce critical rules; do not look for ways around a BLOCKED result, report it.
- Automatic Jira status transitions are allowed only to targets explicitly configured in `config/integrations.yaml`.
- Subagents get only the context their role needs. Reviewer agents receive requirement, code and tests only, never implementer explanations. The test-writer agent sees the approved specification only, never the implementation.
