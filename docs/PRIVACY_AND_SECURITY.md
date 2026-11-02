# AHCL 360 – Privacy, location policy and security checklist

> **DRAFT for AHCL management / legal approval.** Items marked ⟨AHCL⟩ need a decision. This draft describes what the
> software does today; it is not legal advice. Align it with the Digital Personal Data Protection Act, 2023 and AHCL's HR
> policies before rollout.

## 1. Personal data processed

| Data | Whose | Why | Where stored | Protection |
|---|---|---|---|---|
| Name, mobile, email, role, manager, territory | Employees, partner staff | Accounts, approvals, reporting | MongoDB | Role-based access |
| PAN, Aadhaar, bank account number | Employees, retailers | KYC, salary, statutory | MongoDB | AES-256-GCM field encryption, masked in the app (`********1234`) |
| KYC images, bills, offer letters, payslips | Employees, partners, retailers | Verification, reimbursement, HR | MongoDB (`UPLOAD_STORAGE=mongo`) or server disk | Every file AES-256-GCM encrypted; download only after an ownership/scope check |
| GPS location | Field employees | Attendance, visit validation, route & travel distance, reimbursement | MongoDB | Only during duty (see §2); retention limit |
| Device push token, device model | App users | Notifications | MongoDB | Removed when invalid or on "sign out of all devices" |
| Audit log (logins, approvals, admin actions, IP address) | All users | Security, accountability | MongoDB | Admin-only access |

## 2. Location tracking policy (draft)

1. **When:** only after the employee taps **Check in**, only inside their configured office hours and working days, and
   never after **Check out**, sign-out, account block or session expiry. The server discards any point recorded outside
   office hours.
2. **Visibility:** while tracking, Android shows a permanent notification "AHCL 360 is tracking your route". The Home
   screen shows a **● Live** badge or the reason tracking is off.
3. **Who can see it:** the employee, their reporting managers (up the hierarchy) and admins. Partners never see employee
   locations.
4. **Purpose limitation:** attendance, visit validation, travel distance and reimbursement, and live team view for
   managers during duty hours. ⟨AHCL⟩ confirm no other use.
5. **Accuracy and integrity:** fixes worse than 100 m, jitter and impossible jumps are ignored in distance calculation;
   locations that Android reports as coming from a **mock-location app** are flagged on attendance, visits and routes.
6. **Retention:** raw GPS points are deleted automatically after `LOCATION_RETENTION_DAYS` (default **180 days**);
   daily totals on attendance/visit records are kept with HR records. ⟨AHCL⟩ confirm period.
7. **Permission refused:** the employee can still check in with a one-time location; continuous tracking stays off, the
   Home screen shows why, and the employee does not appear on the manager's live map.
8. **Grievance:** ⟨AHCL⟩ name a grievance officer (name, email, phone) to receive questions or correction requests about
   location and personal data. Requests are actioned by an admin (edit profile, correct records, deactivate account).

## 3. Retention and deletion ⟨AHCL to confirm periods⟩

| Record | Proposed retention | Mechanism |
|---|---|---|
| Raw GPS points | 180 days | Automatic (database TTL) |
| Attendance, leave, payslips | As per statutory HR record requirements | Admin |
| Invoices, credit notes, orders | 8 years (GST record rules) | Admin |
| KYC documents of a deactivated user/retailer | ⟨AHCL⟩ | Admin deletes file (`DELETE /api/files/:id`) |
| OTPs | 5 minutes | Automatic |
| Refresh tokens / sessions | 30 days max, 30 minutes idle | Automatic |
| Backups | 14 days rolling (self-hosted script) | Automatic |

## 4. Security controls checklist

| Control | Status |
|---|---|
| HTTPS everywhere (Render / Caddy certificates) | ✅ |
| Passwords hashed (bcrypt, cost 12); password rules (8+ chars, letter + digit) | ✅ |
| OTP hashed, 5-minute expiry, 5 attempts, 30-s resend throttle, per-IP rate limits | ✅ |
| Account lock-out after 5 wrong passwords (15 min) | ✅ |
| Admin panel two-factor sign-in (password + OTP) | ✅ (`ADMIN_MFA`, on in production) |
| Short-lived access tokens (15 min), rotating refresh tokens, idle sign-out (30 min) | ✅ |
| Immediate revocation on block, password change/reset, "sign out of all devices" | ✅ |
| Role and tenant scoping on the server for every list, record, file and export | ✅ (tests T02, T07) |
| Unauthorized records answer 404 (no ID probing) | ✅ |
| No self-approval (leave, expense, reimbursement, reports) – including admins | ✅ |
| Client-supplied prices/discounts/totals ignored | ✅ |
| Field- and file-level encryption (AES-256-GCM); key only in environment | ✅ |
| Upload type checked from file content; 10 MB limit | ✅ |
| No request bodies (PAN/Aadhaar/OTP) written to access logs | ✅ (in demo mode the console SMS provider prints OTPs – never use it in production) |
| Security headers (Helmet, CSP) | ✅ |
| Audit log of admin and authentication events | ✅ |
| Dependency vulnerability check in CI (`npm audit`) | ✅ |
| Secrets never committed to Git (`.env`, service-account keys, backups ignored) | ✅ |
| Encrypted, tested backups and restore drill | ✅ tooling + test; ⟨AHCL⟩ schedule and off-site storage |
| Uptime alerting, error/crash tracking, central logs | ⏳ pending AHCL's choice of services |
| Penetration test by an independent party | ⏳ recommended before go-live |
| Key custody: who holds `ENCRYPTION_KEY` and how it is escrowed | ⟨AHCL⟩ |
