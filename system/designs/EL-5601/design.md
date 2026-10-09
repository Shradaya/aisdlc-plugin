# EL-5601 design: Alert Guidelines link

- Design ticket: EL-5601 (Design sub-task of EL-5597)
- Artifact URL: none (Claude Design integration pending; built from two mockup images supplied by the developer)
- Owner: unknown
- Version read: v1, 2026-10-07
- Status: observed (transcribed from images); developer confirmed the transcription matches on 2026-10-07. Not `human-confirmed` for design approval, which happens through specification approval.
- Used by: EL-5597 (see `children.yaml`)

## Screens

### S1 Transmission Report (Report Notes card)
- Header: title "Report Notes" left; right side "Alert Guidelines" + external-link icon, then "View previous alerts".
- Link style: green link color, same as "View previous alerts". (observed)
- States shown: default only.
- Component hint (inferred): same header container as `PreviousAlert` in `ReportNotes.js`; MUI Link/Button text variant with `OpenInNew` icon.

### S2 Patient Profile (Patient Reports panel, Reports tab)
- Header: "Patient Reports" title with subtitle "The reports will open in a new window"; right side "Alert Guidelines" + external-link icon, immediately left of the "Search Report" field. (observed)
- States shown: default only.
- Component hint (inferred): `renderTopToolbarCustomActions` area in `PatientReport.js`.

## Open questions and gaps
- Hover/focus/disabled states, error message text, responsive behavior, exact typography and spacing are not in the images (inferred from existing link styles during implementation).

## Change log
- v1 (2026-10-07): initial snapshot from two mockup images.

## Provenance
Source: developer-supplied images. Status: observed. Confidence: high for placement and labels, low for unshown states.
