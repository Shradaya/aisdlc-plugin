# EL-5602 design: Insurance Information authorization fields

- Design ticket: EL-5602 (developer-recorded; Jira design sub-task EL-5603 exists)
- Artifact URL: none (built from two mockup images supplied by the developer)
- Owner: unknown
- Version read: v1, 2026-10-07
- Status: observed (transcribed from images); to be confirmed by the developer against the images. Not `human-confirmed`; design approval happens through specification approval.
- Used by: EL-5602 (see `children.yaml`)

## Screens
- S1 Insurance Information tab, Primary Insurance, view state: new row AUTHORIZATION CODE / TREATMENT START / TREATMENT END after PLAN / PATIENT RELATION / EFFECTIVE DATE, before INSURED DETAILS. (observed)
- S2 Same, edit state: new row Authorization Code / Treatment Start / Treatment End (date inputs with calendar icon) after Plan / Patient Relation / Effective Date; Cancel and Save buttons. (observed)
Full detail in `versions/v1/snapshot.md`.

## Open questions and gaps
- Validation error display, loading, disabled, hover and responsive states are not in the images.
- Blank value glyph differs in the image (-- vs em dash); spec D3 uses the existing em dash.
- Secondary/Tertiary expanded states are not shown; the same form component applies.
- The images contain what looks like sample patient values; they are not copied into this folder. Confirm they are not real patient data.

## Change log
- v1 (2026-10-07): initial snapshot from two mockup images.

## Provenance
Source: developer-supplied images. Status: observed. Confidence: high for placement and labels, low for unshown states.
