---
repository: evoke-portal-front-end
analyzed_commit: 35b36e323291354f6cb8fe43162c8f0dec9a1478
analyzed_branch: main
analyzed_at: 2026-10-15T08:45:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [src/app/store/index.js, src/reducers/index.js, src/app/store/*/slice, src/app/store/transmission/slice/state/, src/schemas/, src/utils/storage.util.js, src/app/lib/cacheApi.js, src/utils/auth.js, src/app/store/accountDocument/api/accountDocumentApi.js, src/components/common/accountDocument/AccountDocumentLink.js, src/static/account_document.js, src/hooks/useCloseModalPage.js]
---

# evoke-portal-front-end: Data model (Phase F)

No database. Server schema `unknown` here (no schema or model files; API addressed by URL only). Developer-confirmed: the repository owns no persistent data. This file describes the client-side model.

## Redux store (observed)

`src/app/store/index.js`: `devTools: true` (line 53, all builds, re-verified), `serializableCheck` and `immutableCheck` off, 41 RTK Query middlewares (new `accountDocumentApi`). Root reducer resets on `RESET_APP_STATE`. RTK Query endpoints are `queryFn` wrappers around axios services, so server data including PHI lives in the store.

Slices: `account` (accounts, accountsMapper), `auth` (currentUser: role, userId, name, accounts, manufacturer, user_prefs, followingHospitals, clinii_user_id, primary_role, secondary_roles, login_by, idp_user), preference slices, `alertProtocol`, `archiveReport` (search criteria, page size 25), dashboard filter slices, `manualUpload` (about 30 keys), `nonCompliantPatient`, `patient` (table and RPM state), `patientProfileDocument`, `rpmPatient`, `task`, `users`, `userActivityLog`, and `transmission` (largest, 16 state files: reports, reportDetail, PDF blob and url, clinic/provider/patient/EHR notes, report notes, billing date, tasks, modal flags, patient profile). Legacy reducers: alerts, accounts, patients, upload, appTheme.

## Entities as the UI sees them (observed)

- Account document availability (`accountDocumentApi.getAccountDocumentAvailability`, by account id): flags `alert_protocol_available`, `clinic_protocol_available` map to document types `alertProtocol`, `clinicProtocol` (`static/account_document.js`); any fetch error yields an empty result (no link). The PDF is fetched on click as a blob, re-titled with `pdf-lib` (`utils/pdf.js loadPdfWithTitle`) and shown in an iframe in a new tab; the blob URL is revoked after `OBJECT_URL_REVOKE_DELAY_MS` (60 s). Not kept in Redux.
- Patient (`transmissionPatientModalState.js`): profile (account, serial_number, send and bill dates, dob, names, gender, marital_status, ssn, mrn, manufacturer, physicians, active, hospital, referringProviderId, preferredLanguage, idtf, laao_device, rpm_devices), billingSchedule, contact information, history (diagnosis, stroke, anticoag), deviceInformation, insurance primary/secondary/tertiary (new fields `authorization_code`, `treatment_start`, `treatment_end`, `transmissionPatientModalState.js:97-99`; yup rules in `InsuranceInformationForm.js`: code max length `AUTHORIZATION_CODE_MAX_LENGTH`, valid dates, start on or before end), guarantor, phone opt-out, alert information.
- Report: reportId, billing and diagnosis codes, alert flags, notes, sign/process/archive state; tabs `evk_active`, `evk_processed`, `clinic_active`, `clinic_for_review`, `clinic_processed` (`constants.js:1396-1440`); `legacy` flag.
- Task (EL-5599: optional linked patient; `taskApi.js` and `taskService.js` pass `patientId`, `patientName`, `patientSerialNumber` and read `task.patient._id/name/serial_number`; `useTaskModal.js` invalidates the `patientNotesHistory` tag in `patientApi` after save), live-call task, device, device group, manufacturer account, insurance, referring provider, letter template, alert protocol and notification config, quick text template, notification, user (with `secondary_roles`), ADT message.
- Task statuses `To Do`, `In Progress`, `Blocked`, `Complete`; report alert severity `None`, `Warning`, `Critical`.

27 yup schemas in `src/schemas`; the patient SSN schema is inline in `PatientBasicInfoForm.js`.

## Browser storage (names only; observed)

- localStorage session keys: `authToken`, `role`, `userRole`, `userId`, `userName`, `clinicName`, `primaryRole`, `physician`, `clinicReviewer`, `hasRPMDevices`, `followingPhysicians`, `followingHospitals`, `isFollowingPhysician`, `isFollowingHospital`, `clinii_user_id`, `timestamp`, `prefs`, `passwordTimeStamp`, `pageSize`, `appTheme`; redirect keys `previousPath`, `previousUserId`, `previousUserRole`; `SESSION_EXPIRY_BROADCAST`. EL-5580: module-level flag `skipPreviousPathRestore` in `utils/auth.js` (memory, not storage): when a 401 body `data.code` is in `SESSION_BLOCKED_CODES` (`ACCOUNT_DEACTIVATED`, `ACCOUNT_LOCKED`, `constants.js:22`), logout removes `previousPath` instead of saving `previousUserId` and `previousUserRole`.
- Per-user keys `isDrawerOpen`, `myPatientsToggled`, `patientTableColumn`, `transmissionTableColumn`, `transmissionTableSorting` persist after logout by design (`storage.util.js`). `prefs` is written with no reader and is not cleared at logout.
- sessionStorage, IndexedDB: unused. Cookies: no client use; `withCredentials: true` so server cookies are possible (`unknown`). `BroadcastChannel("redux_sync")` syncs refetch flags across tabs (message types seen in `utils/broadcastChannel.js`: `refetchDeviceList`, `refetchAccounts`, plus one more not named here; `refetchAccounts` is sent after a notification-preference save).

## Other client state changes (observed, `35b36e3`)

- Notification preferences: `getNotificationPreferences` reads the user role (`utils/currentUser.util`) and fetches only for roles `admin` and `user`; others get `{}`. The alert-notification modal keeps `selectedRecipients` per message key in local `useState` (`useAlertNotification.js`); each Email config needs at least one selected recipient, and the payload sends the selected recipients for Email configs and `config.recipients` otherwise.
- Quick text templates: `useQuickTextTemplates` returns default and own templates per report state; own templates only for Clinic Review reports when `ownTemplatesOnReviewOnly`; gated by account setting `show_quick_text_templates`; skipped for archived reports; refetch on `quickTextTemplate.shouldRefetch`.
- Notifications: `markAllAsRead` and `markAsRead` mutations invalidate the `Notifications` tag; the header resets to the first page after mark-all (EL-5419; reset mechanism in `resetToFirstPage`, not traced further).
- Transmission tab counts: `useGetReportsCountQuery` (tag `transmissionsCount`) feeds `changeCount`, re-applied on `fulfilledTimeStamp` (EL-5409; exact cross-tab and filter behavior not traced).
- Next Send reminder row (`ReminderSchedule.js`): channels Email, Call, SMS (EL-5475 subject: email reminders for next-send alerts); backend semantics `unknown`.
- Report and patient pages that show only a modal close via `useCloseModalPage` (EL-5664); EL-5607 Save fix in a new-tab patient profile was not traced in code (`unknown` beyond the commit subject).

## Caching

`cacheApi.js`: `axios-cache-interceptor` 1.0.1 with default options (its response interceptor now passes the 401 body to `handleUnauthorizedError`) (TTL and storage `unknown`, library defaults not verified); used for Cognito calls, report-note template POST and the report PDF blob GET. `removeCache()` clears localStorage keys containing "transmission-list" (no writer found; inferred legacy). RTK Query caches in memory.
