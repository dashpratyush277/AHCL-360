import fs from 'node:fs';
import { env } from '../config/env.js';
import { Notification, User } from '../models/index.js';

let messaging = null;
let initTried = false;
let initError = null;

/** Lazily initialise Firebase Admin (FCM) from a service-account file or base64 JSON. */
async function getMessaging() {
  if (initTried) return messaging;
  initTried = true;
  const raw = env.firebaseServiceAccountBase64
    ? Buffer.from(env.firebaseServiceAccountBase64, 'base64').toString('utf8')
    : env.firebaseServiceAccount
      ? fs.readFileSync(env.firebaseServiceAccount, 'utf8')
      : null;
  if (!raw) return null;
  try {
    const { initializeApp, cert } = await import('firebase-admin/app');
    const { getMessaging: gm } = await import('firebase-admin/messaging');
    const app = initializeApp({ credential: cert(JSON.parse(raw)) }, 'ahcl360');
    messaging = gm(app);
    console.log('[fcm] push notifications enabled');
  } catch (err) {
    initError = err.message;
    console.error('[fcm] disabled:', err.message);
  }
  return messaging;
}

export async function pushStatus() {
  const m = await getMessaging();
  return { enabled: Boolean(m), error: initError };
}

// FCM error codes that mean the device token is permanently invalid.
const DEAD_TOKEN = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument'];

/** Send a push to device tokens; removes tokens FCM reports as dead. Returns counts. */
async function pushToTokens(m, tokens, { title, body, type, data }) {
  let sent = 0;
  const dead = [];
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const res = await m.sendEachForMulticast({
      tokens: batch,
      notification: { title, body },
      data: Object.fromEntries(Object.entries({ type, ...data }).map(([k, v]) => [k, String(v)])),
      android: { priority: 'high', notification: { channelId: 'default', sound: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    sent += res.successCount;
    res.responses.forEach((r, idx) => {
      if (!r.success && DEAD_TOKEN.includes(r.error?.code)) dead.push(batch[idx]);
    });
  }
  if (dead.length) await User.updateMany({ fcmTokens: { $in: dead } }, { $pull: { fcmTokens: { $in: dead } } });
  return { sent, removed: dead.length };
}

/**
 * Store an in-app notification for each user and send a device push via FCM when configured.
 * Never throws - notification failures must not break the business action.
 */
export async function notify(userIds, { title, body, type = 'system', data = {} }) {
  const ids = [userIds].flat().filter(Boolean).map(String);
  if (!ids.length) return { stored: 0, pushed: 0 };
  try {
    await Notification.insertMany(ids.map((user) => ({ user, title, body, type, data })));
    const m = await getMessaging();
    if (!m) {
      if (!env.isProd) console.log(`[push] (FCM not configured) -> ${ids.length} user(s): ${title}`);
      return { stored: ids.length, pushed: 0 };
    }
    const users = await User.find({ _id: { $in: ids } }).select('+fcmTokens');
    const tokens = [...new Set(users.flatMap((u) => u.fcmTokens))];
    const { sent } = tokens.length ? await pushToTokens(m, tokens, { title, body, type, data }) : { sent: 0 };
    return { stored: ids.length, pushed: sent };
  } catch (err) {
    console.error('[notify] failed', err.message);
    return { stored: 0, pushed: 0, error: err.message };
  }
}
