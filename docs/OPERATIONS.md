# AHCL 360 – Operations: deployment, configuration, monitoring, recovery

## 1. Deployment diagram

```
 Android app (Expo, APK/AAB)          Web browser
   Employee + Partner panels            Admin panel
            │  HTTPS / JSON                  │  HTTPS
            └──────────────┬─────────────────┘
                           ▼
        ┌─────────────────────────────────────────┐
        │  AHCL 360 service (one Docker container) │   Render web service
        │   • REST API  /api/*  (Node.js, Express) │   or own server behind Caddy
        │   • Admin panel (static React build)     │   (deploy/docker-compose.prod.yml)
        │   • Reminder scheduler                   │
        └───────┬───────────────┬─────────────┬────┘
                │               │             │
                ▼               ▼             ▼
       MongoDB Atlas      SMS gateway     Firebase Cloud
       (data, encrypted   (Fast2SMS /     Messaging (push)
        files, backups)    MSG91 / Twilio)
```

Environments: **development** (in-memory DB, demo data) → **staging/demo** (`https://ahcl360.onrender.com`, Atlas,
`DEMO_MODE=true`, demo accounts) → **production** (separate Atlas cluster and service, `DEMO_MODE=false`, no demo data,
real SMS, admin MFA). Never point staging at the production database.

## 2. Environment variables (no secret values)

Full list with comments: [`backend/.env.example`](../backend/.env.example).

| Variable | Production value / note | Secret? |
|---|---|---|
| `NODE_ENV` | `production` | |
| `MONGO_URI` | Atlas connection string | **yes** |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | random, different | **yes** |
| `ENCRYPTION_KEY` | 64 hex chars (or 32+ char random); never change after go-live | **yes – escrow it** |
| `UPLOAD_STORAGE` | `mongo` (no disk) or `disk` (+ `UPLOAD_DIR` on a volume) | |
| `DEMO_MODE`, `SEED_DEMO` | `false` in production | |
| `ADMIN_MFA` | `true` (default in production) | |
| `SMS_PROVIDER` + provider keys (`FAST2SMS_*`, `MSG91_*`, `TWILIO_*`) | DLT sender ID + template | **keys yes** |
| `SMTP_*` | optional email OTP | **password yes** |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | push notifications | **yes** |
| `OTP_*`, `MAX_FAILED_LOGINS`, `LOCK_MINUTES`, `IDLE_TIMEOUT_MINUTES` | defaults are sensible | |
| `LOCATION_RETENTION_DAYS` | per approved privacy policy (default 180) | |
| `RATE_PER_KM_*`, `COMPANY_*` | AHCL finance values (printed on invoices) | |
| `CORS_ORIGINS` | admin domain | |

Mobile build settings live in `mobile/eas.json` (`EXPO_PUBLIC_API_URL`, `APP_VARIANT`) and `GOOGLE_MAPS_ANDROID_API_KEY`.

## 3. Monitoring and alerting (recommended set-up)

| What | How | Status |
|---|---|---|
| Uptime | Ping `GET /api/health` every 5 min (e.g. UptimeRobot / Better Stack, free tiers) → email/SMS alert | ⏳ AHCL to choose |
| Application errors | Sentry (Node + React Native SDKs) | ⏳ AHCL to choose |
| Logs | Render log stream (or `docker compose logs`); forward to a log service if required | ✅ available |
| Integrations | Admin **Dashboard → Integrations** card (SMS, push, email, database, storage) + start-up log lines `[otp] … [push] …` | ✅ |
| Database | Atlas metrics and alerts (storage, connections) | ✅ in Atlas |

## 4. Release and rollback

1. Every push to `main` runs CI (`.github/workflows/ci.yml`); merge only when green. Enable branch protection.
2. Tag releases (`git tag v0.3.0 && git push --tags`).
3. Render deploys `main` automatically; **rollback** = Render → service → Deploys → *Rollback* to a previous deploy
   (or `git revert` and push). Self-hosted: `git checkout <tag>` then `docker compose … up -d --build`.
4. Mobile: build a new APK/AAB per release (`npx eas-cli@latest build -p android --profile preview|production`).

## 5. Backup and restore

```bash
# backup (run from backend/, with MONGO_URI of the database to back up)
npm run backup                                   # -> backups/ahcl360-YYYYMMDD-HHMM/
# restore into an EMPTY staging database (never straight into production)
npm run restore -- --from backups/ahcl360-20261102-1400 --uri "<staging MONGO_URI>"
```

* Backups contain encrypted personal data – store them as securely as the database (encrypted drive / private bucket).
* Restored data is readable only with the same `ENCRYPTION_KEY`.
* **Restore drill:** at least once a quarter restore the latest backup to staging and sign in (automated version: test T10).
* Atlas free tier has no automatic backups – schedule `npm run backup` daily, or use Atlas M10+ (continuous backups).

## 6. Incident checklist

1. Owner: ⟨AHCL to name⟩ · Developer contact: ⟨name / phone⟩.
2. Suspected account compromise → admin **Block** the user (revokes all sessions instantly) → reset password.
3. Suspected key leak → rotate JWT secrets (signs everyone out). `ENCRYPTION_KEY` cannot be rotated without
   re-encrypting data – contact the developer.
4. Outage → check `/api/health`, Render logs, Atlas status; roll back the last deploy if it started after a release.
5. Record what happened, impact and fix in the incident log.

## 7. Third-party cost estimate (indicative – verify current prices before ordering)

| Item | Option | Approx. cost |
|---|---|---|
| Hosting (API + admin) | Render Starter web service | about US$7 / month (free tier for demo only – sleeps, no disk) |
| Database | MongoDB Atlas M0 free (no automatic backups) → M10 for production | free → roughly US$55–60 / month |
| SMS OTP | Fast2SMS / MSG91 DLT route | roughly ₹0.15–0.30 per OTP SMS + one-time DLT entity registration fee charged by the operator portal |
| Push notifications | Firebase Cloud Messaging | free |
| Maps | Google Maps SDK for Android (mobile maps) | free for mobile map display; API key required |
| App builds | Expo EAS free plan (limited monthly builds) | free → about US$19 / month for more builds |
| Play Store | Google Play developer account | US$25 one-time |
| Domain | e.g. `app.ahcl.in` | about ₹800–1,500 / year |
| Monitoring / errors | UptimeRobot / Sentry free tiers | free at pilot scale |
