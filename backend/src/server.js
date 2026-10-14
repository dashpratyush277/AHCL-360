import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { env } from './config/env.js';
import { startJobs } from './services/jobs.js';
import { pushStatus } from './services/messaging.js';
import { smsConfigProblems } from './services/otpDelivery.js';

const { inMemory } = await connectDb();
// In-memory dev DB always gets demo data; a real DB only when SEED_DEMO=true (e.g. a hosted demo server).
if (inMemory || process.env.SEED_DEMO === 'true') {
  const { seed } = await import('./seed.js');
  await seed();
}

const server = createApp().listen(env.port, () => console.log(`[api] AHCL 360 API listening on http://localhost:${env.port}/api`));
startJobs();

// Integration report: makes it obvious whether real SMS OTP / push are live.
const problems = smsConfigProblems();
console.log(`[otp] SMS provider: ${env.sms.provider}${problems.length ? ` – NOT READY: ${problems.join('; ')}` : ''}`);
console.log(`[otp] email OTP: ${env.smtp.host ? 'SMTP ' + env.smtp.host : 'not configured'}`);
pushStatus().then((p) => console.log(`[push] FCM: ${p.enabled ? 'enabled' : p.error ? `error – ${p.error}` : 'not configured (in-app notifications only)'}`));
if (env.isProd && problems.length) console.error('[otp] WARNING: production OTP delivery is misconfigured. Users can still sign in with passwords.');

const shutdown = async () => {
  server.close();
  await disconnectDb();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
