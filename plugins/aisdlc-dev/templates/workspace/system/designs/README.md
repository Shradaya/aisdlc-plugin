# UI designs

One folder per **feature ticket** that has frontend changes: `system/designs/<TICKET>/`. The design is the living prototype in the **design repository** (`designs/prototype/`, synced by the `aisdlc-design` plugin). Created here by `/aisdlc-dev:design-link`, which only **reads** the ticket's pages from the registered design repository (read-only git); it never creates or edits the design.

```
system/designs/<TICKET>/
  design.md              source design repo + ref + commit, pages read, states, copy, gaps, component hints, change log
  children.yaml          feature tickets using the design: ticket, pinned_version, screens
  versions/v<N>/
    snapshot.md          extraction exactly as read from the design repo at version N
    snapshot.sha256
```

Rules
- A feature ticket pins one version in section 11 ("Design references") of its specification. The specification hash covers the pin, so repinning or changing the pinned screens needs reapproval.
- A snapshot that a feature ticket pins is never edited or deleted. If the designer changes and re-publishes the design, re-running `design-link` records a new version; feature tickets opt in by revising their specification.
- The snapshot is an extraction from the committed design, and the developer confirms it against the intended design. Gaps become Open Questions, never guesses.
- No patient data, PHI or secrets in these files.
- These folders are durable. Cleanup of a feature ticket's `tasks/<TICKET>/` never touches them; when no listed feature ticket is open, the developer decides whether to mark the design `deprecated`.
- Status values follow the workspace knowledge rules: `observed`, `inferred`, `human-confirmed` (only with explicit human approval), `deprecated`.

