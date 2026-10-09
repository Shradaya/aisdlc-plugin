# EL-5601 design snapshot v1

Source: two designer mockup images supplied by the developer (not read from a Claude Design artifact; artifact integration pending). Read on 2026-10-07. Images: `images/transmission-report.jpg` (sha256 prefix 97e3ced3b5301350), `images/patient-profile.jpg` (sha256 prefix b37b611f502c3d6d). Text below is a transcription of what the images show. A blue hand-drawn underline in each image highlights the new "Alert Guidelines" link.

## Screen S1: Transmission Report (Transmission Report - detail page)

Right-hand column, card "Report Notes":
- Header row: title "Report Notes" (left); on the right, a link "Alert Guidelines" followed by an external-link (open in new) icon, then the existing link "View previous alerts". Link and icon use the portal's green link color, same style as "View previous alerts". "Alert Guidelines" sits immediately left of "View previous alerts".
- Below the header: caption "CIED Remote Transmission Report: Dual Chamber ICD", then the note sections (Leads/Cardiac Compass, Arrhythmias, AP, Battery) with colored note rows, and a signature line "Dr. William - 11/23/2022".
- Other cards on the page, unchanged: "Patient Notes", "Report Transmission Information", clinic notes panel, "Tasks", "Sign & Unprocess" and "Sign & Process" buttons.
- States shown: default with link only. No loading, error, empty or disabled state is shown.

## Screen S2: Patient Profile (Patient Information dialog, General Information tab)

Section with tabs REPORTS (active), TASKS, ALERT BANNER, ANALYTICS, DOCUMENTS; panel "Patient Reports" with subtitle "The reports will open in a new window":
- Panel header, right side: a link "Alert Guidelines" with an external-link icon, then the search field with magnifier icon and placeholder "Search Report". "Alert Guidelines" sits immediately left of the search field. Link uses the green link color and a smaller font than body text.
- Table columns: Name, Report Date, Alert Text, Billing Code, Billable, Alerts; pagination footer "Rows per page: 5", "1-3 of 3".
- Other sections unchanged: Basic Information, Transmission, Schedule - Billing Cycle, Contact Information, "Communication and notes history".
- States shown: default with link only. No loading, error, empty or disabled state is shown.

## Not shown by the design (gaps)
- Hover, focus, pressed and disabled states of the link.
- The behavior and visual of the link when no guideline exists (requirement: link not rendered).
- Error message text for a failed open.
- Responsive behavior.
- Exact font size, spacing, color tokens.
