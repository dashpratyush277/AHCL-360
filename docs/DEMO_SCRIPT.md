# AHCL 360 – Demonstration Script

Follows AHCL's 10 review points in order. Record the **phone screen** (Android: Quick settings → Screen recorder,
with microphone) and the **PC screen** (Windows: `Win + Alt + R`, or OBS) at the same time, or show the phone to a
webcam next to the admin panel.

Total time: about 60–75 minutes, plus a 15–20 minute walk or drive for the GPS part.

---

## 0. Preparation (the day before)

| # | Task | Done |
|---|---|---|
| 0.1 | API running: on the hosted server, or on your PC (`cd backend` → `npm run dev`) | ☐ |
| 0.2 | For a demo with persistent data, use MongoDB (Docker/Atlas) + `npm run seed -- --reset` the morning of the demo | ☐ |
| 0.3 | Admin panel open in the browser (hosted URL, or `cd admin` → `npm run dev` → http://localhost:5173), signed in as **9000000001 / Password@123** | ☐ |
| 0.4 | Test APK built and installed on an Android phone (docs/DEPLOYMENT.md §1) – **not Expo Go** | ☐ |
| 0.5 | On the phone: login screen → *Server … · Change* → correct server address → **Test** shows ✓ | ☐ |
| 0.6 | Phone permissions: Location = **Allow all the time**, Notifications = on, Battery = **Unrestricted** | ☐ |
| 0.7 | For point 6: Firebase configured (§2) and SMS provider configured (§3); admin **Dashboard → Integrations** shows *Live* for both | ☐ |
| 0.8 | Admin → **Employees & Users** → Sneha Das → set **Office start/end** so that the demo falls inside office hours (default 09:30–18:30, Mon–Sat) | ☐ |
| 0.9 | Admin → **Territories & Geofences** → **+ Geofence** → click on the map where you will check in, radius 200 m, *Flag only* | ☐ |
| 0.10 | Second phone (optional) logged in as the manager **9000000002**, to show the manager's mobile view | ☐ |

Demo accounts (password **Password@123**, or OTP):

| Who | Mobile | Used for |
|---|---|---|
| Super admin | 9000000001 | Admin panel |
| Manager (Rakesh Mohanty) | 9000000002 | Admin panel / second phone |
| Field executive (Sneha Das) | 9000000003 | Main phone – employee panel |
| Distributor (Mahanadi Traders) | 9100000002 | Main phone – partner panel |

---

## 1. Live GPS tracking

**Phone (Sneha, 9000000003):**
1. Sign in → **Home**. Show *Office hours* and *GPS tracking: Off – Not checked in*.
2. Tap **Check in**. Allow location "all the time" if asked. Show *GPS tracking: Active* and the Android notification
   *"AHCL 360 is tracking your route"*.
3. Lock the phone and walk or drive for 15–20 minutes (at least 1–2 km). Optionally stop at a shop and use
   **Visits → Start new visit** → choose a retailer → *Check in at client*, then check out a few minutes later.

**Admin panel (while moving):**
4. **Live Tracking & Routes → Live map**: Sneha's marker appears and moves (refreshes every 30 s; hover for last
   seen time and battery).
5. **Route history** tab → select Sneha + today: the route line, numbered visit markers, **Distance travelled (km)**
   and the visit table with location validation.

**Manager phone (optional):** More → **My team** → *Live map* and *Today* → tap Sneha → route map.

**Duty hours:** explain that tracking starts only after check-in, runs only inside office hours and stops itself
afterwards (the server also discards points outside office hours). To show the auto-stop, set Sneha's office end
time to a minute from now in **Employees & Users**; within about 5 minutes (the phone's next upload) the tracking
notification disappears.

## 2. Attendance & HR

1. **GPS attendance**: admin → **Live Tracking & Routes → Today's attendance** shows Sneha's check-in time and
   *Geofence: Head Office / OK*. Check in from outside the fence on another day/account → *Outside* flag.
2. **Leave**: phone → **HR → Apply** → casual leave, next week, reason → Submit. Admin → **Approvals → Leaves** →
   *Review → Approve*. Phone → HR shows **Approved**; the notification arrives.
3. **Holiday calendar**: admin → **HR & Payroll → Holiday calendar → + Add holiday**. Phone → HR → *Holiday calendar*
   shows it.
4. **Salary slips**: admin → **HR & Payroll → Payslips** → select Sneha → **Generate payslip** (tick "credited").
   Phone receives "Salary credited"; HR → *Payslips & salary summary* → download PDF → opens/shares.
5. **Attendance report**: phone → HR → *Monthly attendance & report* → **PDF**.
6. **Documents**: admin → **HR & Payroll → Document vault** → Sneha → issue an *Offer letter* PDF. Phone → HR →
   *Document vault* shows it under "Issued by company". Phone → upload an ID proof photo; admin → **Verify**.
7. **KYC**: phone → HR → *KYC submission* → PAN + Aadhaar + photos → Submit. Admin → **Employees & Users** shows KYC
   *Pending* → **Verify KYC**. Point out the masked Aadhaar (`********9012`).

## 3. Sales & distributor management

Phone (Sneha) → **Sales** tab:
1. *Distributors* → **Mahanadi Traders** → show *Closing stock* per product.
2. **Stock in** → product, quantity 20, invoice no. → Save → closing stock +20.
3. **Stock out** → 5 → closing −5.
4. **Return** → 2 with reason *Damaged* → closing −2; *Recent movements* lists all three.
5. **DSO** → choose retailer → add products → *Save sales order*.
6. Sales → **Targets** → monthly/quarterly progress bars update.
7. Admin → **Targets** → *Set target* for Sneha; performance score table.
8. Admin → **Reports** → *Daily Sales Orders* and *Stock Statement* → **PDF** and **Excel**.

## 4. Channel partner panel

Phone → More → **Log out** → sign in as **Channel Partner**, mobile **9100000002**.
1. **Home**: orders, stock, retailers, reorder suggestions.
2. **Retailers → Onboard new retailer** → name, mobile, *Capture shop GPS location*, PAN + photo → Save →
   "Linked to distributor code DS-OD-101". Show search/filter/sort. Admin → **Retailers** → open it → **Verify KYC**.
3. **Orders → Place new order** → add products → summary shows unit price, GST and total → **Place order**.
4. Admin → **Orders & Invoices** → open the order → **Mark Packed** (GST invoice generated) → **Mark Shipped**
   (tracking no.) → **Mark Delivered**. Each step sends a notification to the phone.
5. Phone → order details: progress bar and history → **Download GST invoice (PDF)**; show CGST/SGST, HSN, amount in
   words. **Inventory** shows the delivered goods added automatically.
6. More → **Claims → Submit new claim** → scheme, amount, attach bill → Submit. Admin → **Approvals → Partner claims**
   → *Ask revision* → phone shows *Revise & resubmit* → resubmit → admin **Approve** → **Mark settled**.

## 5. Offline functionality

Phone (Sneha). Keep **Location on** and turn **Wi-Fi and mobile data off** (airplane mode, then re-enable location).
1. **Visits → Start new visit** → check in → "Saved offline". The visit card shows *Saved offline* → **Check out**.
2. **Sales → DSO** → save an order. **More → Expenses → New expense claim** (food, ₹150) → Submit.
3. Home shows the yellow banner *"N entries saved offline – will sync when online"*.
4. Turn data back on. Within seconds the banner disappears.
5. Admin → **Route history / Approvals → Expenses / Reports** → the entries appear **with their original times**.
6. Explain: each entry has a unique ID, so a retried upload is never applied twice; failed entries are listed under
   *Offline sync* for review.

## 6. Real OTP and push notifications

Requires §2 and §3 of DEPLOYMENT.md (shown as *Live* on the admin **Dashboard → Integrations** card – show this card).
1. **OTP**: log out → *Employee* → *OTP* → enter your **own** mobile number (create yourself as an employee in
   **Employees & Users** first) → **Send OTP** → the SMS arrives → enter it → signed in. Note the code is no longer
   shown on screen.
2. **Push**: More → *Profile & password* → **Send test notification** → notification appears on the lock screen.
3. Admin → **Broadcast** → audience *Employees only* → Send → arrives on the phone; tapping it opens the
   notification list.
4. Mention automatic pushes already shown: leave decision, salary credit, order status, claim status, attendance
   reminder (10 minutes after office start if not checked in).

## 7. Data security

1. **Role-based access**: partner account cannot sign into the employee panel ("This account cannot log into the
   employee panel"); a field executive cannot open the admin panel; a distributor only sees its own orders/stock.
2. **Block access instantly**: admin → **Employees & Users** → *Block* Sneha → on the phone the next action logs her
   out. *Reactivate* afterwards.
3. **Auto logout**: leave the app idle (default 30 minutes) → signed out.
4. **Encryption**: PAN/Aadhaar/bank numbers and every uploaded file are AES-256 encrypted in storage and masked in
   the app. (Optional: open the database in MongoDB Compass and show `kyc.aadhaar: "enc:v1:…"`.)
5. **Other controls**: OTP is hashed, expires in 5 minutes, limited attempts and resend throttle; passwords hashed
   (bcrypt); HTTPS in production; audit log of admin actions (**Broadcast** page → *Recent admin activity*).

## 8. Real-phone checklist

Tick each one on the recording:

| Function | ✓ |
|---|---|
| OTP + password login, employee and partner | ☐ |
| Check-in/out, background GPS with phone locked, route + km in admin | ☐ |
| Visit check-in/out with location validation | ☐ |
| Leave, holidays, payslip PDF, documents, KYC with camera | ☐ |
| Stock in/out/return, DSO, targets | ☐ |
| Expense with bill photo and GPS distance | ☐ |
| Retailer onboarding with GPS + KYC photos | ☐ |
| Order → invoice PDF → stock update, claims | ☐ |
| Offline entries sync after reconnecting | ☐ |
| Push notification received with app closed | ☐ |
| Reports PDF/Excel downloaded and opened on the phone | ☐ |

## 9. Production readiness – what to say

| Item | Status |
|---|---|
| Source code (API, admin, Android app) | Complete; on GitHub |
| Android APK | Test APK built with EAS; Play Store build = `production` profile |
| Hosting | Docker image + Render blueprint + self-host setup ready; needs AHCL's hosting account and domain |
| Database | MongoDB Atlas (or self-hosted) – needs AHCL's account; backups script included |
| SMS gateway | Fast2SMS / MSG91 / Twilio supported; needs AHCL's DLT registration and provider account |
| Firebase push | Code complete; needs AHCL's Firebase project |
| Play Store | Needs AHCL's Google Play developer account and background-location declaration |

## 10. Handover

Use the checklist in DEPLOYMENT.md §7 and agree the handover date for credentials (all accounts in AHCL's name).
