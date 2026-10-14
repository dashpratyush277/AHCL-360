# AHCL 360 – Build, Integrations & Deployment Guide

This guide takes the project from "runs on a developer PC" to "installed on phones and running in production".
Do the steps in order. Each step lists the account it needs and what to hand over to AHCL afterwards.

| Step | Needs | Time |
|---|---|---|
| 1. Android test APK | Free Expo account | ~30 min (build runs in the cloud) |
| 2. Firebase push | Google account → Firebase project | ~20 min |
| 3. Real SMS OTP | SMS provider account + DLT registration | DLT approval can take 2–7 working days |
| 4. Hosting + database | Render (or AWS/GCP) + MongoDB Atlas | ~1 hour |
| 5. First admin & go-live | – | ~15 min |
| 6. Play Store release | Google Play developer account (one-time US$25) | Review takes 1–7 days |

---

## 1. Build an installable Android APK (EAS Build)

Expo Go cannot run background GPS or receive push notifications. A real build of the app can.

```powershell
cd C:\Users\ASUS\Desktop\Project\mobile
npx eas-cli@latest login          # create a free account at https://expo.dev if needed
npx eas-cli@latest init           # links the project; if it asks you to add extra.eas.projectId
                                  # manually, add it under "extra" in app.json
```

Set the server address the test build should use in `mobile/eas.json` → `build.preview.env.EXPO_PUBLIC_API_URL`:

* Testing against your PC on the same Wi-Fi: `http://<PC Wi-Fi IP>:4000/api` (find the IP with `ipconfig`)
* Testing against the hosted server: `https://<your-domain>/api`

The address can also be changed later on the phone: login screen → **Server: … · Change**.

Build:

```powershell
npx eas-cli@latest build -p android --profile preview
```

When the build finishes, open the link (or scan the QR code) on the phone, download the APK and install it
(allow "Install unknown apps" for the browser when asked). The app appears as **AHCL 360 (Test)** and can be installed
next to the store version later.

**On every test phone, after installing:**

1. Open the app, sign in, tap **Check in**. Allow location **"Allow all the time"** (Android shows this as a second
   prompt or sends you to Settings) and allow notifications.
2. Settings → Apps → AHCL 360 (Test) → Battery → **Unrestricted** (Samsung: "Unrestricted"; Xiaomi/Redmi: "No
   restrictions" and enable Autostart; Oppo/Vivo/Realme: allow background activity). Without this, phone makers' battery
   savers stop background GPS.

The `development` profile builds a developer version (hot reload from your PC via `npx expo start`); use `preview` for
demos and field testing.

## 2. Push notifications (Firebase Cloud Messaging)

1. https://console.firebase.google.com → **Add project** (e.g. "AHCL 360").
2. **Add app → Android**. Package name: `com.ahcl.app360.test` for the test build (add a second Android app
   `com.ahcl.app360` for the store build). Download **google-services.json**.
3. Copy it to `mobile/google-services.json` (it is safe to commit; `app.config.js` picks it up automatically). If you
   registered both package names, download the file again after adding the second app – one file contains both.
4. Firebase → Project settings → **Service accounts → Generate new private key**. This JSON is a **secret**.
   * Local server: save it as e.g. `backend/firebase-service-account.json` and set
     `FIREBASE_SERVICE_ACCOUNT=firebase-service-account.json` in `backend/.env` (the file name is git-ignored).
   * Hosting dashboard: base64-encode it and set `FIREBASE_SERVICE_ACCOUNT_BASE64`:
     `[Convert]::ToBase64String([IO.File]::ReadAllBytes("firebase-service-account.json"))`
5. Rebuild the APK (step 1) so it contains `google-services.json`, and restart the API.
6. Check: API log shows `[push] FCM: enabled`; admin dashboard **Integrations** shows Push = Live; on the phone,
   **More → Profile & password → Send test notification** shows a real notification.

## 3. Real SMS OTP

Indian operators only deliver OTP SMS that use a **DLT-registered** sender ID and template (TRAI rule).

1. Register on a DLT portal (Jio, Airtel, Vi, etc.) as AHCL (needs company PAN/GST documents), register a
   **header / sender ID** (e.g. `AHCLIN`) and this **content template** (category: service implicit / OTP):
   `{#var#} is your AHCL 360 login OTP. Valid for 5 minutes. Do not share it. - AHCL`
2. Create an account with an SMS provider and add the DLT entity, sender ID and template there.
   The code supports:
   * **Fast2SMS** (DLT route – integration verified against their API):
     `SMS_PROVIDER=fast2sms`, `FAST2SMS_API_KEY`, `FAST2SMS_SENDER_ID`, `FAST2SMS_DLT_MESSAGE_ID` (the message ID
     Fast2SMS shows for the approved template)
   * **MSG91** (Flow API): `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_OTP_VAR` (the variable
     name used in the MSG91 template). Send one test OTP before go-live – this integration has not been tested against a
     live MSG91 account yet.
   * **Twilio** (international numbers): `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`
   * Any other gateway: `SMS_PROVIDER=webhook` + `SMS_WEBHOOK_URL` (receives `{to, message, otp}`).
3. Set `OTP_EXPOSE=false` so the OTP is no longer shown on screen, restart, and check the admin dashboard
   **Integrations → SMS OTP = Live**. Log in on a phone with OTP; the SMS should arrive within seconds.
4. Optional email OTP (for users who log in with email): set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
   `SMTP_FROM` (e.g. Google Workspace, Zoho Mail, Amazon SES).

If the SMS gateway fails, users get "Could not send the OTP right now" and can still sign in with their password.

## 4. Hosting

The repository contains a `Dockerfile` that builds the admin panel and serves it **from the API on one domain**
(`https://app.example.in` = admin panel, `https://app.example.in/api` = API used by the mobile app).

### Option A – Render + MongoDB Atlas (quickest, managed)

1. **MongoDB Atlas** (https://www.mongodb.com/atlas): create a cluster in Mumbai (ap-south-1), a database user and
   allow access from anywhere (or Render's IPs). Copy the connection string, add `/ahcl360` as the database name.
2. **Render** (https://render.com): New → **Blueprint** → choose this GitHub repo. Render reads `render.yaml` and creates
   the web service with a 5 GB disk for uploads.
3. Fill in the values marked "sync: false": `MONGO_URI`, `ENCRYPTION_KEY`
   (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), SMS settings,
   `FIREBASE_SERVICE_ACCOUNT_BASE64`, company GSTIN/address.
4. After the first deploy, add a custom domain in Render (e.g. `app.ahcl.in`) – HTTPS is automatic.
5. For a **demo server** only, set `SEED_DEMO=true` once to load the demo accounts into the empty database, then set it
   back to `false`.

### Option B – Own server (AWS EC2 / Lightsail, Google Compute Engine, DigitalOcean)

Ubuntu server with Docker installed, DNS A record pointing at it:

```bash
git clone https://github.com/dashpratyush277/AHCL-360.git /opt/ahcl360 && cd /opt/ahcl360
cp backend/.env.example deploy/.env      # fill in: NODE_ENV=production, secrets, SMS, Firebase, company details
DOMAIN=app.ahcl.in docker compose -f deploy/docker-compose.prod.yml up -d --build
```

This runs the app, MongoDB (not exposed to the internet) and Caddy (automatic HTTPS). Schedule
`deploy/backup-mongo.sh` in cron for daily database + uploads backups and copy the `backups/` folder off the server.

### Required production settings (both options)

| Variable | Notes |
|---|---|
| `NODE_ENV=production` | The API refuses to start without the secrets below |
| `MONGO_URI` | Atlas or the compose `mongo` service |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Long random strings, different from each other |
| `ENCRYPTION_KEY` | 64 hex chars. **Back it up in a password manager. If it is lost, encrypted KYC data and uploaded files cannot be read.** Never change it after go-live. |
| `OTP_EXPOSE=false` | |
| SMS + Firebase settings | Steps 2 and 3 |
| `COMPANY_*` | Printed on GST invoices – confirm with AHCL accounts |

## 5. First admin account & go-live

On a production database there are no demo users. Create the first super admin (run where `MONGO_URI` points at the
production database, e.g. Render → Shell, or `docker compose exec app` on your server):

```bash
npm run create-admin -- --name "AHCL Admin" --mobile 98XXXXXXXX --email admin@ahcl.in --password "Choose-A-Strong-1"
```

Sign in to the admin panel and create employees, managers, territories, office geofences, products, distributors and
partner logins (Employees & Users, Territories & Geofences, Products, Distributors pages).

Then build the store version of the app with the production URL in `mobile/eas.json` → `build.production.env`:

```powershell
npx eas-cli@latest build -p android --profile production   # produces an .aab for Google Play
```

## 6. Google Play release

1. Google Play Console → create app "AHCL 360". Upload the `.aab` to **Internal testing** first.
2. Complete **App content**: privacy policy URL, data safety (location, personal info, financial info, photos/files),
   and the **background location declaration**: *"Field employees' routes are recorded only while they are checked in
   during office hours, to calculate travel distance and reimbursements and to show managers live team location. A
   persistent notification is shown while tracking."* Google may ask for a short video showing this.
3. Promote to production when testing is complete.
   (For an internal-only rollout, the signed APK from step 1 or Play "Internal testing" is enough.)

## 7. Handover checklist

Deliver to AHCL (credentials through a password manager or sealed document, **not** email/WhatsApp):

- [ ] GitHub repository access (transfer ownership or add AHCL's account as admin)
- [ ] Super admin login for the admin panel (and instructions to change the password)
- [ ] Hosting account (Render/AWS) – transfer or add AHCL as owner; billing on AHCL's card
- [ ] MongoDB Atlas project – AHCL as owner; backup schedule confirmed
- [ ] `ENCRYPTION_KEY`, JWT secrets and all `.env` values (stored securely)
- [ ] Firebase project – AHCL as owner; service-account key
- [ ] SMS provider + DLT registration – in AHCL's company name
- [ ] Expo account / EAS project – AHCL as owner (keeps the Android signing key)
- [ ] Google Play developer account – AHCL's own account
- [ ] Domain DNS access
- [ ] Documents: README, this guide, the demo script, the project report
