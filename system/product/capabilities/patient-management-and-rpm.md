---
capability: patient-management-and-rpm
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_repository: evoke-portal-front-end
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/containers/AppPage/index.js (routes /patients, /patient/:patientId, /rpm, /no-show-patients*), src/pages/patients, src/pages/nonCompliantPatients, src/pages/liveCallTasks, src/pages/rpm/RPMView.js, src/app/services/patient/, developer answers 2026-10-02]
---

# Patient Management and Remote Patient Monitoring

## What it does today

Staff and clinic users work with patients and remote-monitoring data in the portal.

- **Patient list and profile:** a searchable, filterable patient list (`/patients`, all roles except RPM-only users) and a patient profile page (`/patient/:patientId`) covering demographics, device and lead information, insurance, billing schedule, history, medications, notes, documents, tasks, communication and reminder logs. Staff can enrol patients, change next-send dates, activate or deactivate, merge duplicates and export lists (API behind: [Patient and Device Registration](patient-and-device-registration.md)).
- **Remote patient monitoring:** the RPM view (`/rpm`) embeds the Clinii portal for users who have a Clinii user id; RPM-only users land there. (The older RPM table at `/patient/rpm` is left out of this documentation at the developer's request.)
- **No-show patients (Evoke Admin and User only):** lists of non-compliant patients with reminder history, non-enrolled patients who can be enrolled, an overdue-patients download, and live-call tasks for staff to call patients (see [Patient Communication](patient-communication.md)).

Workflows: [Follow up no-show patients](../user-workflows/follow-up-no-show-patients.md), [Monitor RPM patients](../user-workflows/monitor-rpm-patients.md). Rules: [Portal access and role rules](../business-rules/portal-access-rules.md), [Portal task and status rules](../business-rules/portal-task-and-status-rules.md).

## Implemented by

| Repository | Role |
|---|---|
| evoke-portal-front-end | Screens: patient list and profile, RPM embed, no-show patients, live-call tasks |
| rest-api-evoke | Patient, RPM, non-compliant and live-call APIs and data |
| manufacturer-hl7-parser | Creates patients and devices from transmissions (shared database) |
| patient-billing-schedule | Marks patients late and creates follow-up call and letter tasks; queues a crawler bot event (back-end, no screens) |
| Clinii (third party, not onboarded) | RPM portal shown in an iframe |

## Contribution of patient-billing-schedule (added 2026-10-05)

Provenance: patient-billing-schedule @ ec1d8894c633996d7fc9e7a9423d21521a981bf6, analyzed 2026-10-05, aisdlc@1.0.0; status human-confirmed (developer answers 2026-10-05); confidence medium. Evidence: src/database/schedule.py:200-316, src/database/schedule.py:392-435.

Patients who send no transmission by their late date are marked late and automated follow-up tasks are created for staff: first, second and third follow-up calls and a letter to the patient, at 2, 9, 16 and 20 days after the late date. The tasks are archived when a report arrives. A bot event with the patient id is also queued so the manufacturer crawler (descriptive name; repository unconfirmed) can look for the patient's data. Rule: [Billing window rules](../business-rules/billing-window-rules.md); workflow: [Run the billing schedule](../user-workflows/run-billing-schedule.md). Open question: whether these tasks are the live-call tasks shown in the portal.

## Customer visibility

Customer-visible (developer-confirmed 2026-10-02). The no-show patient screens are reachable only by Evoke Admin and User roles (route evidence).

## Open questions

- Product meaning of "no-show", "non-enrolled" and "RPM" is inferred from names (see [glossary](../glossary.md)).
- Whether the legacy `/patient/rpm` view is still used by customers (excluded at the developer's request).
- Which clinic roles may edit patient fields is enforced by the API and was not examined here.
