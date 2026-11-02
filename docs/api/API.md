# AHCL 360 API reference

Generated from the route files by `npm run api-docs`. 125 endpoints, JSON over HTTPS.

* **Auth:** `Authorization: Bearer <accessToken>` (from `/api/auth/login`, `/api/auth/otp/verify` or `/api/auth/mfa/verify`). Access tokens last 15 minutes; renew with `/api/auth/refresh`.
* **Scope:** every list and record is filtered on the server by role (employee → own data, manager → team, admin → all; partner → own distributor, super distributor → + child distributors). Records outside your scope answer **404**.
* **Errors:** `{ "error": "message", "details": [{ "path", "message" }] }` with 400/401/403/404/409/429/5xx.
* **Paging:** list endpoints accept `?page=&limit=` and return `{ items, total, page, limit }`.

## Authentication (public except where noted)

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/api/auth/otp/request` | public |  |
| POST | `/api/auth/otp/verify` | public |  |
| POST | `/api/auth/login` | public |  |
| POST | `/api/auth/mfa/verify` | public |  |
| POST | `/api/auth/password/reset` | public | Forgotten password: prove possession of the registered mobile/email with an OTP, then set a new one. |
| POST | `/api/auth/refresh` | public |  |
| POST | `/api/auth/logout` | public |  |
| POST | `/api/auth/logout-all` | signed-in | Sign out every other device; this device gets fresh tokens. |
| GET | `/api/auth/me` | signed-in |  |
| POST | `/api/auth/change-password` | signed-in |  |
| POST | `/api/auth/fcm-token` | signed-in |  |

## Encrypted file upload / download

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/api/files` | signed-in | POST /api/files (multipart, field "files", optional "purpose") |
| GET | `/api/files/:id` | signed-in |  |
| DELETE | `/api/files/:id` | signed-in |  |

## Attendance (employees)

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/api/attendance/check-in` | signed-in |  |
| POST | `/api/attendance/check-out` | signed-in |  |
| GET | `/api/attendance/today` | signed-in |  |
| GET | `/api/attendance/month` | signed-in |  |
| GET | `/api/attendance/report` | signed-in | Monthly attendance report download. ?month=YYYY-MM&format=pdf\|xlsx&user= |
| GET | `/api/attendance/team` | manager/admin | Team attendance for a given day (managers/admins). |

## GPS tracking (employees)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/tracking/config` | signed-in | App polls this to auto start/stop background tracking with office hours. |
| POST | `/api/tracking/pings` | signed-in | Batch upload of GPS points (background task / offline buffer). |
| GET | `/api/tracking/route` | signed-in | Route map history: ?user=&date=YYYY-MM-DD |
| GET | `/api/tracking/live` | manager/admin | Live location of team members (last ping in the past 30 min). |

## Client visits (employees)

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/api/visits` | signed-in |  |
| POST | `/api/visits/:id/check-out` | signed-in |  |
| GET | `/api/visits` | signed-in |  |
| GET | `/api/visits/:id` | signed-in |  |

## HR: leave, holidays, payslips, documents, KYC

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/hr/holidays` | signed-in |  |
| POST | `/api/hr/holidays` | admin |  |
| DELETE | `/api/hr/holidays/:id` | admin |  |
| POST | `/api/hr/leaves` | signed-in |  |
| GET | `/api/hr/leaves` | signed-in | ?scope=mine (default) \| team ; ?status= |
| GET | `/api/hr/leaves/balance` | signed-in |  |
| POST | `/api/hr/leaves/:id/cancel` | signed-in |  |
| POST | `/api/hr/leaves/:id/review` | manager/admin |  |
| GET | `/api/hr/payslips` | signed-in |  |
| GET | `/api/hr/payslips/:month/pdf` | signed-in |  |
| GET | `/api/hr/salary-summary` | signed-in |  |
| POST | `/api/hr/payslips` | admin |  |
| GET | `/api/hr/documents` | signed-in |  |
| POST | `/api/hr/documents` | signed-in |  |
| POST | `/api/hr/documents/:id/verify` | admin |  |
| POST | `/api/hr/kyc` | signed-in | KYC submission: identity numbers are encrypted at rest; files go to the vault. |
| POST | `/api/hr/kyc/:userId/review` | admin |  |

## Expense claims

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/expenses/estimate` | signed-in | Preview auto-calculated travel amount: ?date=YYYY-MM-DD&mode=bike |
| POST | `/api/expenses` | signed-in |  |
| GET | `/api/expenses` | signed-in | ?scope=mine\|team&status=&from=&to= |
| PATCH | `/api/expenses/:id` | signed-in |  |
| DELETE | `/api/expenses/:id` | signed-in |  |
| POST | `/api/expenses/:id/review` | manager/admin |  |
| POST | `/api/expenses/:id/reimburse` | admin | Finance marks approved claims as reimbursed. |

## Team management (managers)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/team/juniors` | manager/admin | Direct + indirect juniors with today's status. |
| POST | `/api/team/work-reports` | signed-in |  |
| GET | `/api/team/work-reports` | signed-in | ?scope=mine\|team&status=&date= |
| POST | `/api/team/work-reports/:id/review` | manager/admin |  |
| GET | `/api/team/performance` | manager/admin | Per junior for a period: attendance %, visits, distance, sales vs target, report approval, expenses and a weighted score (0-100). |
| POST | `/api/team/juniors/:id/assign` | manager/admin | Reassign a junior to a manager (admin or the current manager). |

## PDF / Excel reports

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/reports/:type` | signed-in |  |

## Offline sync

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/api/sync` | signed-in |  |

## Dashboards

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/analytics/dashboard` | signed-in | Home dashboard numbers, tailored to the caller's panel and role. |
| GET | `/api/analytics/charts` | signed-in | Chart series: sales/visits/order value by month, orders by status, top distributors, stock. |

## Administration (admins only)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/admin/users` | admin |  |
| GET | `/api/admin/users/:id` | admin |  |
| POST | `/api/admin/users` | admin |  |
| PATCH | `/api/admin/users/:id` | admin |  |
| POST | `/api/admin/users/:id/block` | admin | Block / reactivate. Blocking revokes all sessions immediately. |
| POST | `/api/admin/users/:id/force-logout` | admin |  |
| GET | `/api/admin/territories` | admin |  |
| POST | `/api/admin/territories` | admin |  |
| PATCH | `/api/admin/territories/:id` | admin |  |
| DELETE | `/api/admin/territories/:id` | admin |  |
| GET | `/api/admin/geofences` | admin |  |
| POST | `/api/admin/geofences` | admin |  |
| PATCH | `/api/admin/geofences/:id` | admin |  |
| DELETE | `/api/admin/geofences/:id` | admin |  |
| POST | `/api/admin/broadcast` | admin |  |
| GET | `/api/admin/system-status` | admin | Integration health for the admin panel: SMS OTP, push, email, database mode. |
| GET | `/api/admin/audit-logs` | admin |  |

## Products, distributors, stock, DSO, targets

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/products` | signed-in |  |
| POST | `/api/products` | admin |  |
| PATCH | `/api/products/:id` | admin |  |
| GET | `/api/distributors` | signed-in |  |
| GET | `/api/distributors/:id` | signed-in |  |
| POST | `/api/distributors` | admin |  |
| PATCH | `/api/distributors/:id` | admin |  |
| GET | `/api/stock` | signed-in | Distributor-wise stock statement: opening / in / out / return / adjustment / closing. |
| POST | `/api/stock/txns` | signed-in |  |
| GET | `/api/stock/txns` | signed-in |  |
| GET | `/api/stock/reorder-suggestions` | signed-in |  |
| PUT | `/api/stock/reorder-levels` | signed-in |  |
| POST | `/api/dso` | signed-in |  |
| GET | `/api/dso` | signed-in |  |
| GET | `/api/targets` | signed-in |  |
| PUT | `/api/targets` | manager/admin |  |

## Orders, invoices, credit notes, retailers, claims

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/api/orders/quote` | signed-in | Price preview (cart summary) without placing the order. |
| POST | `/api/orders` | signed-in |  |
| GET | `/api/orders` | signed-in |  |
| GET | `/api/orders/:id` | signed-in |  |
| POST | `/api/orders/:id/status` | signed-in |  |
| POST | `/api/orders/:id/returns` | admin | Goods returned after delivery (damaged, expired, wrong item...). Creates a GST credit note, takes the goods out of the distributor's stock and records the return on the order. |
| GET | `/api/credit-notes` | signed-in |  |
| GET | `/api/credit-notes/:id/pdf` | signed-in |  |
| GET | `/api/invoices` | signed-in |  |
| GET | `/api/invoices/:id/pdf` | signed-in |  |
| POST | `/api/retailers` | signed-in |  |
| GET | `/api/retailers` | signed-in | ?q=&city=&distributor=&kycStatus=&sort=name\|-createdAt |
| GET | `/api/retailers/:id` | signed-in |  |
| PATCH | `/api/retailers/:id` | signed-in |  |
| POST | `/api/retailers/:id/kyc-review` | manager/admin |  |
| POST | `/api/claims` | signed-in |  |
| GET | `/api/claims` | signed-in |  |
| GET | `/api/claims/:id` | signed-in |  |
| PATCH | `/api/claims/:id` | signed-in | Partner re-submits after "revision_requested". |
| POST | `/api/claims/:id/review` | admin |  |

## Profile, notifications, support

| Method | Path | Access | Notes |
|---|---|---|---|
| PATCH | `/api/profile` | signed-in |  |
| GET | `/api/notifications` | signed-in |  |
| POST | `/api/notifications/read` | signed-in |  |
| POST | `/api/notifications/test` | signed-in | Sends a push to the caller's own devices – used to verify FCM on a real phone. |
| GET | `/api/support/contact` | signed-in |  |
| POST | `/api/support/tickets` | signed-in |  |
| GET | `/api/support/tickets` | signed-in |  |
| GET | `/api/support/tickets/:id` | signed-in |  |
| POST | `/api/support/tickets/:id/messages` | signed-in |  |
| POST | `/api/support/tickets/:id/status` | admin |  |

