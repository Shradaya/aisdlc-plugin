# EL-5602 design snapshot v1 (transcribed 2026-10-07 from two developer-supplied images)

Source images (not copied here; they may show sample patient values): `tasks/EL-5602/design/view-ins.png`, `tasks/EL-5602/design/edit-ins.png`.
Image sha256: see `images.sha256` in this folder.

## Screen S1 - Patient Information modal > INSURANCE INFORMATION tab, Primary Insurance, VIEW state
- Modal title "Patient Information"; tabs: GENERAL INFORMATION, MEDICAL HISTORY, DEVICE INFORMATION, INSURANCE INFORMATION (selected), DATA POINTS, SUBSCRIPTION. Top right of the tab: toggles "Self Pay", "Pre-Auth".
- Card "Insurance Information". Section header "PRIMARY INSURANCE" (blue link style) with green badge "ACTIVE"; right: pencil icon + "Edit" (green) + chevron.
- Field grid (4 columns, label in small caps grey above value):
  - Row 1: INSURANCE NAME, PATIENT ID NUMBER, PATIENT GROUP NUMBER, INSURANCE CODE
  - Row 2: PLAN, PATIENT RELATION, EFFECTIVE DATE
  - Row 3 (NEW): AUTHORIZATION CODE, TREATMENT START, TREATMENT END (same label/value style, first three columns)
  - "INSURED DETAILS:" (blue small caps); then FIRST NAME, LAST NAME, GENDER, DOB; STREET, CITY, STATE, ZIP.
- Dates shown MM/DD/YYYY. Blank values shown as a dash in the image ("--" for PLAN and EFFECTIVE DATE, an em dash for CITY).
- Collapsed rows below: SECONDARY INSURANCE (grey badge INACTIVE), TERTIARY INSURANCE (INACTIVE), GUARANTOR (INACTIVE), each with "Edit" + chevron. The image does not show the new rows for those blocks (same form component per spec).

## Screen S2 - same tab, Primary Insurance, EDIT state
- Section header "PRIMARY INSURANCE" with toggle "Active" (on).
- Outlined floating-label inputs, 3 columns:
  - Row 1: Insurance Name (dropdown), Patient ID Number, Patient Group No.
  - Row 2: Plan (placeholder "Plan"), Patient Relation (dropdown, "Self"), Effective Date (placeholder "Effective Date", calendar icon)
  - Row 3 (NEW): Authorization Code (text input), Treatment Start (date, calendar icon), Treatment End (date, calendar icon). Empty-state text placeholders per the ticket: "Authorization Code", "Treatment Start", "Treatment End".
  - "INSURED DETAILS:" then Insured First Name, Insured Last Name, Insured Gender (dropdown); Insured Date of Birth, Insured Street Address, Insured City; Insured State (dropdown), Insured Zip.
- Buttons bottom right: "Cancel" (outlined green), "Save" (filled green).
- Not shown in the images: validation error state, loading, disabled, hover, responsive behavior.
