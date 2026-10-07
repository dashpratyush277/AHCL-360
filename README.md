# AHCL 360°

Field operations, HR, sales and distribution platform for AHCL employees and channel partners.

| Folder | What | Stack |
|---|---|---|
| [`backend/`](backend) | REST API | Node.js 20+, Express 5, MongoDB (Mongoose), JWT + OTP, PDFKit, ExcelJS |
| [`admin/`](admin) | Web admin panel (super admin / admin / manager) | React 19, Vite, React Router, Recharts, Leaflet |
| [`mobile/`](mobile) | Mobile app – Employee panel + Channel Partner panel | Expo SDK 57, React Native, Expo Router |

## Quick start (no database setup needed)

```bash
# 1. API – starts an in-memory MongoDB and loads demo data automatically
cd backend && npm install && npm run dev        # http://localhost:4000/api

# 2. Admin panel
cd admin && npm install && npm run dev           # http://localhost:5173

# 3. Mobile app
cd mobile && npm install && npx expo start       # scan the QR code with Expo Go
```

Demo accounts (password `Password@123`, or use OTP – in development the OTP is shown on screen):

| Panel | Mobile | Role |
|---|---|---|
| Admin web | 9000000001 | Super admin |
| Admin web | 9000000005 | Admin (HR) |
| Employee app / Admin web | 9000000002 | Manager (has 2 juniors) |
| Employee app | 9000000003, 9000000004 | Field executives |
| Partner app | 9100000001 | Super distributor |
| Partner app | 9100000002 | Distributor |
| Partner app | 9100000003 | Stockist |

**Persistent database:** `docker compose up -d`, copy `backend/.env.example` to `backend/.env`, set
`MONGO_URI=mongodb://localhost:27017/ahcl360`, then `npm run seed` once. MongoDB Atlas works the same way.

**Phone on Wi-Fi:** the app calls the API on your PC's LAN IP at port 4000 automatically (from the Metro host).
Override with `EXPO_PUBLIC_API_URL` in `mobile/.env` if needed.

## Feature map

### 1. Employee panel (mobile)
| Requirement | Where |
|---|---|
| OTP / password login, role-based access | `login.js`; roles `super_admin, admin, manager, field_executive, staff` – enforced server-side in every route |
| GPS live tracking, auto start/stop with office hours | `mobile/src/lib/tracking.js` (background task, buffered upload); server ignores pings outside office hours |
| Visit logs: client, purpose, time, **distance (km)**, check-in/out location validation | `employee/visit-new.js`, `(tabs)/visits.js`; distance from GPS trail since the previous visit; flagged if >300 m from the client's saved location |
| Route map history | `employee/route.js` (also for juniors) and admin → Live Tracking |
| Check-in / check-out with GPS + geofence | Home tab; geofences managed in admin (flag-only or blocking) |
| Leave (Pending/Approved/Rejected), holidays, monthly attendance PDF | HR tab → leave, attendance, holidays |
| Payslips, salary summary, document vault, KYC upload | HR tab → payslips (PDF), documents, KYC (PAN/Aadhaar/bank encrypted at rest) |
| Travel expense: bills, **auto calculation by distance**, Pending/Approved/Reimbursed | More → Expenses; amount = GPS km × rate per km (rates in `.env`) |
| Mapped distributors; stock in / out / closing / return (with reason) | Sales tab → distributor → stock entry |
| Daily Sales Order (DSO), target vs achievement (monthly/quarterly) | Sales tab |
| Team: junior mapping, daily work reports, approve/comment, track juniors' GPS, performance matrix | More → My team / Review work reports |
| Auto-generated PDF/Excel reports | More → Reports (daily work, expense, visit route, attendance, sales) |

### 2. Channel partner panel (mobile)
| Requirement | Where |
|---|---|
| Login via mobile/email + OTP; tiers Distributor / Super Distributor / Stockist | Super distributors also see their child distributors' data |
| Place orders from a dynamic catalog; summary with unit, price, discount, GST, total | `partner/order-new.js` – priced server-side (`POST /orders/quote`) |
| Order tracking Processing → Packed → Shipped → Delivered; invoice PDF | `partner/order/[id].js`; packing generates a GST invoice, delivery posts stock-in automatically |
| Inventory: in/out, reorder suggestions, closing stock, adjustment (damaged/returned) | Inventory tab; reorder level = configured or 30-day avg sales × (lead + safety days) |
| Invoice history, GST-compliant invoices (CGST+SGST / IGST) | More → Invoices |
| Retailer onboarding with GPS + KYC (PAN, Aadhaar, GST), linked to distributor code; filter/sort list | Retailers tab |
| Claims with bills, real-time status, notifications, revision flow | More → Claims |

### 3. Common
Push notifications (orders, claims, attendance reminders, salary credit, targets, announcements) · profile and
password change · in-app support tickets plus call/email · **offline mode** (queued entries replay through
`POST /api/sync`, idempotent by client id) · encryption of sensitive data · auto-logout after inactivity · admin
block/reactivate · analytics dashboard with PDF/Excel export.

### Admin panel (web)
Employee/partner onboarding and roles, approvals (leaves, expenses, claims, work reports), targets and performance,
territories and geofences (map), live tracking and route history, distributors (stock, ledger, reorder), retailers
(KYC review), product catalog, orders and invoices, payroll and documents, broadcast notifications, support tickets,
all reports, audit log.

## Security notes
- Short-lived JWT access tokens (15 min) plus rotating refresh tokens stored hashed; reuse is rejected.
- Idle sessions expire server-side (`IDLE_TIMEOUT_MINUTES`); the app and admin also log out locally.
- Blocking a user or changing a password bumps `tokenVersion`, which revokes every session immediately.
- PAN, Aadhaar and bank account numbers use AES-256-GCM field encryption; all uploaded files are encrypted on disk
  and served only through an authorised endpoint. API responses mask identity numbers.
- Mobile tokens are kept in the device keystore (`expo-secure-store`).
- OTP is hashed, expires (5 min) and is attempt-limited; auth endpoints are rate-limited.
- **Production checklist:** set `JWT_*_SECRET`, `ENCRYPTION_KEY` (back it up – files are unreadable without it),
  `MONGO_URI`, `CORS_ORIGINS`, `OTP_EXPOSE=false`, `SMS_WEBHOOK_URL`, and serve everything over HTTPS.

## Push notifications & maps (production)
- **FCM:** `npm i firebase-admin` in `backend`, set `FIREBASE_SERVICE_ACCOUNT` to the service-account JSON path,
  and add `google-services.json` to the mobile app. Remote push does not work in Expo Go on Android; build a
  development build with `npx eas-cli build --profile development`. Without FCM, notifications are still stored and
  shown in-app.
- **Background GPS** needs a development/production build as well (Expo Go only tracks in the foreground).
- **Google Maps on Android:** replace `REPLACE_WITH_GOOGLE_MAPS_ANDROID_KEY` in `mobile/app.json`.

## Tests

```bash
cd backend && npm test     # 17 end-to-end API tests on an in-memory MongoDB
```

## API overview (all under `/api`, Bearer token unless noted)
`auth/*` (public: otp/request, otp/verify, login, refresh) · `attendance/*` · `tracking/*` · `visits` · `hr/*`
(leaves, holidays, payslips, salary-summary, documents, kyc) · `expenses` · `products` · `distributors` · `stock/*`
· `dso` · `targets` · `team/*` (juniors, work-reports, performance) · `orders` · `invoices` · `retailers` · `claims`
· `reports/:type` (`daily-work, expense, visit-route, attendance, sales, orders, stock`; `?format=pdf|xlsx`) ·
`analytics/*` · `notifications` · `support/*` · `files` · `sync` · `admin/*` (users, territories, geofences,
broadcast, audit-logs).
