---
repository: evoke-portal-front-end
analyzed_commit: 79953d33432479d03bcde9545050dbb9a7193ed8
analyzed_branch: main
analyzed_at: 2026-10-02T00:00:00Z
generator: aisdlc@1.0.0
status: observed
confidence: high
evidence: [src/app/store/index.js, src/reducers/index.js, src/app/store/*/slice, src/app/store/transmission/slice/state/, src/schemas/, src/utils/storage.util.js, src/app/lib/cacheApi.js]
---

# evoke-portal-front-end: Data model (Phase F)

No database. Server schema `unknown` here (no schema or model files; API addressed by URL only). Developer-confirmed: the repository owns no persistent data. This file describes the client-side model.

## Redux store (observed)

`src/app/store/index.js`: `devTools: true` (line 52, all builds), `serializableCheck` and `immutableCheck` off, about 40 RTK Query middlewares. Root reducer resets on `RESET_APP_STATE`. RTK Query endpoints are `queryFn` wrappers around axios services, so server data including PHI lives in the store.

Slices: `account` (accounts, accountsMapper), `auth` (currentUser: role, userId, name, accounts, manufacturer, user_prefs, followingHospitals, clinii_user_id, primary_role, secondary_roles, login_by, idp_user), preference slices, `alertProtocol`, `archiveReport` (search criteria, page size 25), dashboard filter slices, `manualUpload` (about 30 keys), `nonCompliantPatient`, `patient` (table and RPM state), `patientProfileDocument`, `rpmPatient`, `task`, `users`, `userActivityLog`, and `transmission` (largest, 16 state files: reports, reportDetail, PDF blob and url, clinic/provider/patient/EHR notes, report notes, billing date, tasks, modal flags, patient profile). Legacy reducers: alerts, accounts, patients, upload, appTheme.

## Entities as the UI sees them (observed)

- Patient (`transmissionPatientModalState.js`): profile (account, serial_number, send and bill dates, dob, names, gender, marital_status, ssn, mrn, manufacturer, physicians, active, hospital, referringProviderId, preferredLanguage, idtf, laao_device, rpm_devices), billingSchedule, contact information, history (diagnosis, stroke, anticoag), deviceInformation, insurance primary/secondary/tertiary, guarantor, phone opt-out, alert information.
- Report: reportId, billing and diagnosis codes, alert flags, notes, sign/process/archive state; tabs `evk_active`, `evk_processed`, `clinic_active`, `clinic_for_review`, `clinic_processed` (`constants.js:1396-1440`); `legacy` flag.
- Task, live-call task, device, device group, manufacturer account, insurance, referring provider, letter template, alert protocol and notification config, quick text template, notification, user (with `secondary_roles`), ADT message.
- Task statuses `To Do`, `In Progress`, `Blocked`, `Complete`; report alert severity `None`, `Warning`, `Critical`.

27 yup schemas in `src/schemas`; the patient SSN schema is inline in `PatientBasicInfoForm.js`.

## Browser storage (names only; observed)

- localStorage session keys: `authToken`, `role`, `userRole`, `userId`, `userName`, `clinicName`, `primaryRole`, `physician`, `clinicReviewer`, `hasRPMDevices`, `followingPhysicians`, `followingHospitals`, `isFollowingPhysician`, `isFollowingHospital`, `clinii_user_id`, `timestamp`, `prefs`, `passwordTimeStamp`, `pageSize`, `appTheme`; redirect keys `previousPath`, `previousUserId`, `previousUserRole`; `SESSION_EXPIRY_BROADCAST`.
- Per-user keys `isDrawerOpen`, `myPatientsToggled`, `patientTableColumn`, `transmissionTableColumn`, `transmissionTableSorting` persist after logout by design (`storage.util.js`). `prefs` is written with no reader and is not cleared at logout.
- sessionStorage, IndexedDB: unused. Cookies: no client use; `withCredentials: true` so server cookies are possible (`unknown`). `BroadcastChannel("redux_sync")` syncs refetch flags across tabs.

## Caching

`cacheApi.js`: `axios-cache-interceptor` 1.0.1 with default options (TTL and storage `unknown`, library defaults not verified); used for Cognito calls, report-note template POST and the report PDF blob GET. `removeCache()` clears localStorage keys containing "transmission-list" (no writer found; inferred legacy). RTK Query caches in memory.
