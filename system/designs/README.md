# UI designs

One folder per **design ticket** (the ticket number the developer gives when a feature needs frontend changes): `system/designs/<DESIGN-TICKET>/`. The designer's finished Claude Design artifact carries that number in its title. Created by `/aisdlc:ui-design`, which only **reads** the design; it never creates or edits it.

```
system/designs/<DESIGN-TICKET>/
  design.md              artifact URL, version read, screens and states, copy, gaps, component hints, change log
  children.yaml          feature tickets using the design: ticket, pinned_version, screens
  versions/v<N>/
    snapshot.md          extraction exactly as read from the artifact at version N
    snapshot.sha256
```

Rules
- A feature ticket pins one version in section 11 ("Design references") of its specification. The specification hash covers the pin, so repinning or changing the pinned screens needs reapproval.
- A snapshot that a feature ticket pins is never edited or deleted. If the designer changes the design, re-running `ui-design` records a new version; feature tickets opt in by revising their specification.
- The snapshot is an extraction (the tool returns a summary of another person's artifact), and the developer confirms it against the design. Gaps become Open Questions, never guesses.
- No patient data, PHI or secrets in these files.
- These folders are durable. Cleanup of a feature ticket's `tasks/<TICKET>/` never touches them; when no listed feature ticket is open, the developer decides whether to mark the design `deprecated`.
- Status values follow the workspace knowledge rules: `observed`, `inferred`, `human-confirmed` (only with explicit human approval), `deprecated`.
