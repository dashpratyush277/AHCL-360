# AHCL 360° – Developer response to the First-Cut Technical Review

**Review:** "AHCL 360° | First-Cut Technical Review & Final-Cut Instructions", 31 October 2026
**Response date:** 2 November 2026 · **Release:** `v0.3.0` (GitHub `dashpratyush277/AHCL-360`, tag `v0.3.0`)
**Staging/demo server:** https://ahcl360.onrender.com (admin panel + API, MongoDB Atlas, demo data, demo mode)

We agree with the verdict (*right direction, incomplete verification, not production-approved*) and have continued the
existing codebase. This document answers every section of the review. Status words used:

* **Done** – implemented and covered by an automated test or verifiable in the source.
* **Done – needs AHCL** – implemented, but needs an AHCL decision, account or sign-off before go-live.
* **Pending** – not done yet; reason and plan given.

---

## 1. What changed since the 7 October report

| Area | Change |
|---|---|
| Branding | AHCL logo and the approved "AHCL ONE" design (navy / blue palette, role cards) applied to the mobile app, admin panel, app icon, splash screen and every PDF (invoice, credit note, payslip, reports). |
| Persistence | Staging runs on MongoDB Atlas (persistent). Uploaded files can be stored encrypted in the database (no server disk needed). Backup/restore tooling added and tested. |
| Authentication | Admin two-factor sign-in (password + OTP), account lock-out after repeated wrong passwords, OTP-based password reset, "sign out of all other devices", real SMS/email OTP providers. |
| Authorization | No self-approval for anyone (incl. admins). Another partner's records answer **404** (not 403) so IDs cannot be probed. 19 sign-off tests incl. negative authorization. |
| Data integrity | Stock movements use atomic conditional updates (no negative stock, no double take of the last unit); order status changes are compare-and-set; one invoice per order enforced by a unique index; offline operations are claimed before being applied (exactly-once). |
| Finance | Pricing and GST computed in integer paise; CGST+SGST always sum exactly; rupee round-off; **order returns with GST credit notes** and stock reversal. |
| GPS | Mock (fake-GPS) locations flagged on attendance, visits and tracking; retention configurable; tracking follows office-hours changes within ~5 minutes; blocked/expired sessions stop tracking. |
| Documents | Upload file type verified from file content (not the declared type). |
| Mobile UX | New login with role cards, inline validation and errors, keyboard handling, Forgot-password; always-visible sync status (waiting / failed / synced / last synced) with retry/discard; distributor search; India-time dates; live GPS indicator; test tools hidden in release builds. |
| Engineering | GitHub Actions CI (tests + coverage, lint, builds, lockfile check, Docker image), API reference + Postman collection, backup/restore scripts, demo-data safeguards for production. |

## 2. Section 2 – observations from the first-cut video

| Time | Instruction | Status | What was done |
|---|---|---|---|
| 00:05–00:25 | Login: contrast, validation, keyboard avoidance, clear errors, loading | **Done** | Redesigned login (AHCL design). Mobile-number/email validation shown under the field, error box with plain-language messages (incl. "Cannot reach the server"), keyboard-avoiding layout, "Please wait…" loading state, muted text raised to ≥4.5:1 contrast. |
| 00:40–01:05 | Home: attendance/GPS status, last sync, empty states, date labels | **Done** | Home shows today's date, attendance card, **live GPS badge** (or the reason it is off), sync status with last-synced time, target progress; empty states on every list. |
| 01:30 | Sales: search/filter, distributor details, stock, sales flow | **Done** | Distributor search; distributor screen with closing stock, ledger, reorder alerts, stock in/out/return and DSO. |
| 02:00 | HR: payslip PDF, leave approval, privacy, entitlements | **Done – needs AHCL** | Payslip PDF (with logo), leave approval (no self-approval), KYC numbers encrypted and masked. Leave entitlements (12 casual / 10 sick / 15 earned) are placeholders – **AHCL HR to confirm.** |
| 02:30 | Work reports: loading/empty/error states, manager-only access | **Done** | Review screen restricted to managers on the server; loading/empty/error states present. |
| 03:00 | Remove test controls from release; security/session/device settings | **Done** | Push-test button and server-address setting appear only in test builds. New "Security & sessions" card: auto sign-out time, device, app version, **Sign out of all other devices**. |

## 3. Section 4 – P0 items (before any live business data)

| P0 item | Status | Detail / evidence |
|---|---|---|
| **Permanent storage**, backups, recovery drill, restricted credentials, never seed production | **Done – needs AHCL** | Atlas MongoDB (persistent). `npm run backup` / `npm run restore` (gzipped Extended JSON, encrypted data stays encrypted); restore drill automated in test **T10**. Demo data can no longer be loaded into a production database unless the server is explicitly a demo (`DEMO_MODE=true`); `seed --reset` refuses in production. Indexes are created by the application at start-up. *AHCL:* production Atlas cluster (M10+ for automatic backups), database user with least privilege, IP allow-list. |
| **Authentication**: no displayed OTP / shared demo passwords in production, SMS gateway, OTP expiry/limits, throttling, password reset, session revocation, admin MFA | **Done – needs AHCL** | OTP shown on screen only when `DEMO_MODE=true` (staging). OTP: hashed, 5-min expiry, 5 attempts, 30-s resend throttle; per-IP rate limit; **account lock-out** after 5 wrong passwords (15 min); **OTP password reset**; **admin MFA** (password + OTP; OTP-only admin login refused); sign-out-everywhere; tokens revoked on block/password change. Tests: T01 suite. SMS providers implemented (Fast2SMS – API verified; MSG91, Twilio, webhook) – *AHCL:* DLT registration + SMS account. Production must be created without demo accounts (`npm run create-admin`). |
| **Authorization**: server-side role and tenant scoping for every endpoint, file, export; Partner A never sees Partner B; no self-approval | **Done** | All scoping is server-side (`backend/src/utils/scope.js`). Cross-partner order, invoice, credit note, claim and **file** requests return 404 (test **T02**). Super-distributor child list resolved on the server only. No self-approval for leave, expense, reimbursement, work report, targets – including admins (test **T07**). Prices, discounts, totals and IDs from the client are ignored (test **T02** pricing). |
| **GPS privacy**: declared policy/hours, visible notification, permission denial, reboot, battery saver, spoofing, inaccurate fixes, retention, grievance | **Done – needs AHCL** | Tracking only after check-in and inside office hours (server also drops points outside hours – test **T03**); persistent Android notification while tracking; denial shown as the reason on Home; inaccurate fixes (>100 m), jitter and impossible jumps filtered; **mock locations flagged** (test T03); retention `LOCATION_RETENTION_DAYS` (default 180). Reboot/battery saver: Android stops background services after reboot – tracking resumes when the employee opens the app; battery "Unrestricted" instructions in the deployment guide. Draft policy: [PRIVACY_AND_SECURITY.md](PRIVACY_AND_SECURITY.md) – *AHCL legal to approve, name a grievance officer.* |
| **Financial correctness**: CA sign-off on GST, HSN, place of supply, rounding, numbering, credit notes, returns, discount authorization, reconciliation | **Done – needs AHCL CA sign-off** | Integer-paise calculation, CGST/SGST split that always adds up, rupee round-off with amount in words, FY-based numbering (`INV/2627/00001`, `CN/2627/…`), one invoice per order, **returns → GST credit note → stock reversal** (test **T06**), discounts only by admins, invoice arithmetic test **T08**. *Not yet built:* ledger/finance reconciliation report, e-invoicing (IRN) – to be scoped with the CA. |
| **Secure documents**: key management, no Aadhaar/PAN in logs, encrypted backups, access checks, file-type limits, deletion/retention | **Done – needs AHCL** | AES-256-GCM for PAN/Aadhaar/bank and every uploaded file; key only in environment; request logs contain no bodies; backups keep data encrypted (T10); every file download checks ownership/scope (T02); **file type checked from content**, 10 MB limit. *AHCL:* retention periods for KYC/documents (policy draft provided); key custody (who holds `ENCRYPTION_KEY`). |
| **Production operations**: HTTPS, secrets, environment isolation, monitoring, alerts, logs, error tracking, rollback, backups, incident owner | **Partly done** | HTTPS (Render/Caddy), secrets in hosting environment variables (never in Git), separate staging vs production configs, health endpoint + Docker health check, rollback = redeploy previous tag (Render keeps deploy history), backups (above). **Pending:** uptime alerting, error tracking (e.g. Sentry) and centralised logs – need AHCL's choice of services; incident owner to be named. See [OPERATIONS.md](OPERATIONS.md). |

## 4. Section 5 – P1 workflows and UX

| Area | Status | Notes |
|---|---|---|
| Employee | **Done** | Clock-in/out with geofence, live GPS badge, client selection + geo-validation, offline attendance/visits (incl. check-out of a visit started offline), work report with confirmation, manager approvals with history. |
| Sales | **Done** (scheme approval pending) | Mapping, catalog, DSO, targets, stock ledger, damaged/expiry returns with reason, negative-stock prevention, search. *Scheme/discount approval workflow* is part of the P2 scheme engine. |
| Partner | **Done** (delivery proof pending) | Searchable catalog, cart, server-priced quote, status timeline, invoice + credit-note PDFs, stock movement, claims with attachments, revision/dispute status. *Proof of delivery (photo/signature)* – pending, small addition once AHCL confirms who captures it. |
| HR | **Done – needs AHCL** | Monthly attendance + PDF, leave, holidays, payslip preview/download, expense bills/reimbursement, restricted documents. *Variable pay logic* needs AHCL's payroll rules. |
| Admin | **Done** (import/export partly) | Responsive panel, onboarding, approval queues, roles, audit log, territory/geofence map editor, PDF/Excel exports. *Bulk Excel import* is P2. |
| UX | **Partly done** | Contrast, buttons and cards ≥44 px tall (filter chips still smaller), confirmations for irreversible actions, accessibility labels on new screens, empty/error states, no infinite spinners. *Hindi/Bengali labels*: waiting for AHCL approval of languages and translations. |
| Sync | **Done** | Waiting / failed / synced counts and last-synced time always visible; exactly-once replay (test **T04**); permanent errors kept with **Try again / Discard**. Offline operations are create-only (visits, orders, expenses, reports, stock), so conflicting edits cannot occur; edits require a connection. |

## 5. Section 6 – P2 (scope approval required)

Not started, as instructed. Retailer login appears on the login screen as **"Coming soon"** only. Credit limits/aging,
batch/expiry inventory, scheme engine, Excel imports, multi-company segregation and executive MIS will be estimated once
AHCL approves scope.

## 6. Section 7 – technical implementation rules

| Rule | Status |
|---|---|
| Business rules/authorization on the API; never trust client price, discount, user, distributor or status | **Done** (T02) |
| Schema validation, unique indexes, transactions, audit events, idempotency keys | **Done**, with one deviation: instead of multi-document transactions, critical paths use **atomic single-document operations** (conditional stock decrement, compare-and-set status, unique indexes, claim-then-apply sync) that give the same guarantees on any MongoDB deployment. Multi-document transactions can be added on Atlas (replica set) if AHCL's reviewer requires them. |
| UTC storage, IST display, Indian financial year | **Done** |
| Paginated, indexed queries for GPS, orders, invoices, logs; retention | **Done** |
| CI: lint, tests, security scan, build, staged deployment; protected main branch | **Done** (`.github/workflows/ci.yml`, incl. `npm audit`). *Repository owner:* enable branch protection on `main` (GitHub → Settings → Branches). |
| Real-device builds for background location and notifications | **Pending** – APK pipeline ready; device test matrix in section 7 below. |

## 7. Section 11 – QA sign-off cases

Automated tests: `cd backend && npm test` → **41 tests, all passing** (line coverage 86.7 %). Test names in
`backend/test/signoff.test.js` start with the review's IDs.

| ID | Scenario | Status | Evidence |
|---|---|---|---|
| T01 | Login, logout, wrong / expired OTP | **Pass** | T01 suite (+ lock-out, password reset, admin MFA) |
| T02 | Partner reads another partner's order / invoice / file | **Pass** – 404 | T02 suite |
| T03 | Check-in/out; location denied / outside hours | **Pass** (server) · device part pending | T03 suite; permission-denied flow to verify on device |
| T04 | Offline create; sync twice | **Pass** – exactly one record | T04 (simultaneous duplicate upload) |
| T05 | Two simultaneous orders for the last unit | **Pass** | T05 (stock) + T05 (single invoice) |
| T06 | Order → packed → shipped → delivered → return | **Pass** | T06 (credit note, stock, audit trail) |
| T07 | Expense → approve → reimburse, no self-approval | **Pass** | T07 suite (history preserved) |
| T08 | Payslip / invoice / report totals; PDF & XLSX | **Pass** (arithmetic + generation) · print check by AHCL | T08, api.test reports |
| T09 | Force close, reboot, poor network, battery saver | **Pending – needs devices** | to run during pilot (G4) |
| T10 | Backup and restore to staging | **Pass** | T10 (restore drill, encrypted files readable) |
| T11 | Block user with active session | **Pass** | T11 |
| T12 | 50–100 pilot users, realistic volume | **Pending – pilot** | after G3 |

## 8. Section 12 – deliverables

| Deliverable | Status |
|---|---|
| Git repository, complete source, tagged release, README; no secrets/demo credentials in release | **Done** – tag `v0.3.0`; secrets only in environment; demo accounts exist only on the demo server. |
| Feature-wise screen-recorded demo on persistent staging | **Ready to record** – script: [DEMO_SCRIPT.md](DEMO_SCRIPT.md); staging: https://ahcl360.onrender.com |
| APK/AAB, test URLs, restricted demo accounts, API documentation | **Done** – APK via EAS (link supplied with each build); API: [api/API.md](api/API.md) + [Postman collection](api/AHCL360.postman_collection.json). |
| Test report with coverage, negative authorization tests, backup/restore proof, crash/error logs | **Done** except crash logs – [TEST_REPORT.md](TEST_REPORT.md). Crash reporting needs a service (Sentry/Firebase Crashlytics) – pending AHCL choice. |
| Deployment diagram, environment list (no secrets), security/privacy checklist, third-party costs | **Done** – [OPERATIONS.md](OPERATIONS.md), [PRIVACY_AND_SECURITY.md](PRIVACY_AND_SECURITY.md), [DEPLOYMENT.md](DEPLOYMENT.md) |
| Deviations, completed, pending, blockers, dates | This document (sections 9–10). |

## 9. Deviations from the 7 October report

1. Development still uses an in-memory database for convenience; **staging and production use MongoDB Atlas** (persistent).
2. Uploaded files can be stored in the database (`UPLOAD_STORAGE=mongo`) instead of disk, for hosts without a disk.
3. Order flow gained **returns and credit notes**; order statuses now include *partially returned* / *returned*.
4. Admin sign-in now needs **password + OTP**; the OTP-only admin login was removed.
5. Unauthorized access to another partner's records now returns **404** instead of 403.
6. Test count grew from 17 to 41; CI added.

## 10. Pending items, blockers and proposed plan

| # | Item | Blocked on | Plan |
|---|---|---|---|
| 1 | DLT registration + SMS account | **AHCL** (company documents) | Integration ready; 2–7 working days after AHCL applies |
| 2 | Firebase project (push) | **AHCL** Google account | 1 day after access |
| 3 | Production hosting + Atlas M10 (backups) + domain | **AHCL** accounts/billing | 1 day after access |
| 4 | CA sign-off on GST documents; reconciliation report scope | **AHCL** accountant | after sign-off |
| 5 | Privacy policy approval, grievance officer, retention periods | **AHCL** legal/HR | draft supplied |
| 6 | Leave entitlements, payroll/variable pay rules, travel rates | **AHCL** HR/finance | configuration once confirmed |
| 7 | Monitoring, alerts, error/crash tracking | AHCL choice of services | 1–2 days |
| 8 | Real-device test matrix (T03 device, T09) | Android test phones | week 3 of the review's plan |
| 9 | Pilot with 5–10 employees, 1 manager, 1–2 partners (G4, T12) | AHCL nominations | week 4 |
| 10 | Hindi/Bengali labels; retailer login and other P2 items | AHCL approval | estimate after approval |

Gate readiness: **G1** source available for audit now · **G2** demo can be recorded now on staging · **G3** waiting on
items 1–6 · **G4/G5** after G3. Dates follow the review's suggested 4-week sequence from the day AHCL provides the
accounts and decisions above; they are planning targets, not commitments, until those inputs arrive.
