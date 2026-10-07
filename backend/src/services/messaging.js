import fs from 'node:fs';
import { env } from '../config/env.js';
import { Notification, User } from '../models/index.js';

let messaging = null;
let initTried = false;

/** Lazily initialise Firebase Admin for FCM if a service account is configured. */
async function getMessaging() {
  if (initTried) return messaging;
  initTried = true;
  if (!env.firebaseServiceAccount) return null;
  try {
    const admin = (await import('firebase-admin')).default;
    const creds = JSON.parse(fs.readFileSync(env.firebaseServiceAccount, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(creds) });
    messaging = admin.messaging();
  } catch (err) {
    console.warn('[fcm] disabled:', err.message, '(npm i firebase-admin and set FIREBASE_SERVICE_ACCOUNT)');
  }
  return messaging;
}

/**
 * Store an in-app notification for each user and send a push via FCM when available.
 * Never throws - notification failures must not break the business action.
 */
export async function notify(userIds, { title, body, type = 'system', data = {} }) {
  const ids = [userIds].flat().filter(Boolean).map(String);
  if (!ids.length) return;
  try {
    await Notification.insertMany(ids.map((user) => ({ user, title, body, type, data })));
    const m = await getMessaging();
    if (!m) {
      if (!env.isProd) console.log(`[push] -> ${ids.length} user(s): ${title}`);
      return;
    }
    const users = await User.find({ _id: { $in: ids } }).select('+fcmTokens');
    const tokens = users.flatMap((u) => u.fcmTokens);
    for (let i = 0; i < tokens.length; i += 500) {
      await m.sendEachForMulticast({
        tokens: tokens.slice(i, i + 500),
        notification: { title, body },
        data: Object.fromEntries(Object.entries({ type, ...data }).map(([k, v]) => [k, String(v)])),
      });
    }
  } catch (err) {
    console.error('[notify] failed', err.message);
  }
}

/** Send an OTP via the configured SMS gateway, or log it in development. */
export async function sendOtp(identifier, code) {
  if (!env.smsWebhookUrl) {
    console.log(`[otp] ${identifier}: ${code}`);
    return;
  }
  await fetch(env.smsWebhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to: identifier, message: `${code} is your ${env.company.name} 360 login OTP. Valid for ${env.otp.ttlMinutes} minutes.` }),
  });
}
