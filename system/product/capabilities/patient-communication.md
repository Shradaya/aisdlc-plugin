---
capability: patient-communication
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_repository: evoke-portal-front-end
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: medium
evidence: [src/components/ZoomPhoneEmbed/ZoomPhoneEmbed.js, src/containers/LetterManagement, src/app/services/transmission/letter_templates.js, src/app/services/patient/rpmPatient.js (communication logs), src/hooks/useTranscription.js, developer answers 2026-10-02]
---

# Patient Communication

## What it does today

Staff contact patients and record the contact from within the portal.

- **Calls:** a Zoom Phone softphone is embedded in the portal; staff place calls to patients and call events (ringing, completed, duration) are logged against the patient and live-call tasks.
- **Communication log:** staff record contacts with date, duration and mode on a patient (used for RPM communication time).
- **Letters:** letter templates (with translations, battery and next-send details) are created and managed; letters and no-show letters are generated and sent for patients.
- **Dictation:** note editors can stream the user's microphone to a transcription channel to dictate notes.

Server-side outreach (SMS reminders, mailed letters) is described in [Patient Outreach](patient-outreach.md).

## Implemented by

| Repository | Role |
|---|---|
| evoke-portal-front-end | Softphone embed, communication log, letter management, dictation client |
| rest-api-evoke | Communication-log, letter and live-call APIs |
| Zoom Phone (third party) | Calling |
| Realtime socket service (not onboarded) | Transcription channel |

## Customer visibility

Internal (proposed and accepted 2026-10-02).

## Open questions

- The speech-to-text vendor behind dictation is not visible in this repository.
- Which roles may place calls is not established beyond the screens that show the phone.
