import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AuditLog, Otp, RefreshToken, User } from '../models/index.js';
import { deliverOtp } from '../services/otpDelivery.js';
import { issueTokens, revokeRefreshToken, rotateRefreshToken } from '../services/tokens.js';
import { randomOtp, sha256 } from '../utils/crypto.js';
import { HttpError, badRequest, forbidden, unauthorized } from '../utils/http.js';

const tooMany = (msg) => new HttpError(429, msg);

const r = Router();
// Per-IP throttle on every credential endpoint (on top of per-account lockout and OTP limits).
const limiter = rateLimit({ windowMs: 15 * 60_000, limit: env.nodeEnv === 'test' ? 1000 : 20, standardHeaders: 'draft-8', legacyHeaders: false });

const identifier = z.string().trim().min(5).max(100);
// panel: which app panel the user is logging into; prevents partners logging into the employee panel and vice versa.
const panel = z.enum(['employee', 'partner', 'admin']).optional();
const newPassword = z.string().min(8).max(128).regex(/[A-Za-z]/, 'Must contain a letter').regex(/\d/, 'Must contain a digit');

/** Find a user by email, or by mobile in any common format (+91 98765 43210, 09876543210, ...). */
function findByIdentifier(id) {
  const v = id.trim().toLowerCase();
  const fields = '+passwordHash +failedLogins +lockedUntil';
  if (v.includes('@')) return User.findOne({ email: v }).select(fields);
  const digits = v.replace(/\D/g, '');
  const last10 = digits.slice(-10);
  const variants = [...new Set([id.trim(), digits, last10, `+91${last10}`, `91${last10}`, `0${last10}`])];
  return User.findOne({ mobile: { $in: variants } }).select(fields);
}

function assertPanel(user, p) {
  if (user.isBlocked) throw forbidden('Account is blocked. Contact admin.');
  if (p === 'admin' && !['super_admin', 'admin', 'manager'].includes(user.role)) throw forbidden('No admin panel access');
  if ((p === 'employee' || p === 'partner') && user.userType !== p) throw forbidden(`This account cannot log into the ${p} panel`);
}

const audit = (user, action, req, meta) =>
  AuditLog.create({ actor: user?._id, action, entity: 'User', entityId: String(user?._id ?? '-'), meta: { ip: req.ip, ...meta } }).catch(() => {});

async function completeLogin(user, req, res, method) {
  user.lastLoginAt = new Date();
  user.failedLogins = 0;
  user.lockedUntil = undefined;
  if (req.body.fcmToken) await User.updateOne({ _id: user._id }, { $addToSet: { fcmTokens: req.body.fcmToken } });
  await user.save();
  const tokens = await issueTokens(user, req.headers['user-agent']);
  await user.populate([{ path: 'manager', select: 'name mobile' }, { path: 'distributor', select: 'name code tier' }, { path: 'territory', select: 'name code' }]);
  audit(user, 'auth.login', req, { method });
  res.json({ user: user.toPublic(), ...tokens });
}

/* ------------------------------ OTP helpers ------------------------------ */

/** Create + deliver an OTP for this user (to their registered mobile, or email when `viaEmail`). */
async function issueOtp(user, viaEmail) {
  // OTPs are keyed by user id so every number format maps to the same code.
  const key = String(user._id);
  const recent = await Otp.findOne({ identifier: key });
  const age = recent ? Date.now() - (recent.expiresAt.getTime() - env.otp.ttlMinutes * 60_000) : Infinity;
  if (age < env.otp.resendSeconds * 1000) {
    throw tooMany(`Please wait ${Math.ceil((env.otp.resendSeconds * 1000 - age) / 1000)} s before requesting another OTP`);
  }
  const code = randomOtp();
  await Otp.deleteMany({ identifier: key });
  const otp = await Otp.create({ identifier: key, codeHash: sha256(code), expiresAt: new Date(Date.now() + env.otp.ttlMinutes * 60_000) });
  try {
    await deliverOtp(viaEmail ? user.email : user.mobile, code);
  } catch (err) {
    await otp.deleteOne();
    console.error('[otp] delivery failed:', err.message);
    throw Object.assign(new Error('Could not send the OTP right now. Please try again or sign in with your password.'), { status: 502, expose: true });
  }
  return { sent: true, resendAfterSeconds: env.otp.resendSeconds, ...(env.otp.exposeInResponse ? { devCode: code } : {}) };
}

/** Verify (and consume) the user's current OTP; throws on wrong / expired / too many attempts. */
async function checkOtp(user, code) {
  const otp = user && (await Otp.findOne({ identifier: String(user._id) }));
  if (!otp || otp.expiresAt < new Date()) throw unauthorized('OTP expired, request a new one');
  if (otp.attempts >= env.otp.maxAttempts) throw unauthorized('Too many attempts, request a new OTP');
  if (otp.codeHash !== sha256(code)) {
    otp.attempts += 1;
    await otp.save();
    throw unauthorized('Incorrect OTP');
  }
  await otp.deleteOne();
}

/* ------------------------------ OTP login ------------------------------ */

r.post('/otp/request', limiter, validate(z.object({ identifier, panel })), async (req, res) => {
  const { identifier: id, panel: p } = req.valid.body;
  // Admin panel uses password + OTP when MFA is on; OTP alone is a single factor.
  if (p === 'admin' && env.auth.adminMfa) throw badRequest('Admin sign-in requires your password, followed by an OTP');
  const user = await findByIdentifier(id);
  // Respond identically when the user doesn't exist to avoid account enumeration.
  if (!user) return res.json({ sent: true, resendAfterSeconds: env.otp.resendSeconds });
  assertPanel(user, p);
  res.json(await issueOtp(user, id.includes('@')));
});

r.post('/otp/verify', limiter, validate(z.object({ identifier, code: z.string().length(6), panel, fcmToken: z.string().optional() })), async (req, res) => {
  const { identifier: id, code, panel: p } = req.valid.body;
  if (p === 'admin' && env.auth.adminMfa) throw badRequest('Admin sign-in requires your password, followed by an OTP');
  const user = await findByIdentifier(id);
  await checkOtp(user, code);
  assertPanel(user, p);
  await completeLogin(user, req, res, 'otp');
});

/* ------------------------------ Password login (+ admin MFA) ------------------------------ */

r.post('/login', limiter, validate(z.object({ identifier, password: z.string().min(1), panel, fcmToken: z.string().optional() })), async (req, res) => {
  const { identifier: id, password, panel: p } = req.valid.body;
  const user = await findByIdentifier(id);
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil - Date.now()) / 60_000);
    throw tooMany(`Too many failed attempts. Try again in ${mins} minute(s) or sign in with OTP.`);
  }
  if (!user || !(await user.checkPassword(password))) {
    if (user) {
      user.failedLogins = (user.failedLogins || 0) + 1;
      if (user.failedLogins >= env.auth.maxFailedLogins) {
        user.lockedUntil = new Date(Date.now() + env.auth.lockMinutes * 60_000);
        user.failedLogins = 0;
        audit(user, 'auth.locked', req);
      }
      await user.save();
    }
    throw unauthorized('Invalid credentials');
  }
  assertPanel(user, p);

  if (p === 'admin' && env.auth.adminMfa) {
    // Step 2: OTP to the admin's registered mobile. The short-lived token proves step 1 passed.
    const otp = await issueOtp(user, false);
    const mfaToken = jwt.sign({ sub: String(user._id), purpose: 'mfa', ver: user.tokenVersion }, env.jwt.accessSecret, { expiresIn: `${env.otp.ttlMinutes}m` });
    return res.json({ mfaRequired: true, mfaToken, ...otp });
  }
  await completeLogin(user, req, res, 'password');
});

r.post('/mfa/verify', limiter, validate(z.object({ mfaToken: z.string(), code: z.string().length(6) })), async (req, res) => {
  let payload;
  try {
    payload = jwt.verify(req.valid.body.mfaToken, env.jwt.accessSecret);
  } catch {
    throw unauthorized('Sign-in expired, please start again');
  }
  if (payload.purpose !== 'mfa') throw unauthorized('Invalid sign-in token');
  const user = await User.findById(payload.sub).select('+passwordHash +failedLogins +lockedUntil');
  if (!user || user.tokenVersion !== payload.ver) throw unauthorized('Sign-in expired, please start again');
  await checkOtp(user, req.valid.body.code);
  assertPanel(user, 'admin');
  await completeLogin(user, req, res, 'password+otp');
});

/** Forgotten password: prove possession of the registered mobile/email with an OTP, then set a new one. */
r.post(
  '/password/reset',
  limiter,
  validate(z.object({ identifier, code: z.string().length(6), newPassword, panel, fcmToken: z.string().optional() })),
  async (req, res) => {
    const { identifier: id, code, panel: p } = req.valid.body;
    const user = await findByIdentifier(id);
    await checkOtp(user, code);
    assertPanel(user, p);
    await user.setPassword(req.valid.body.newPassword);
    user.tokenVersion += 1; // sign out every other session
    await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
    audit(user, 'auth.passwordReset', req);
    await completeLogin(user, req, res, 'password-reset');
  },
);

/* ------------------------------ Sessions ------------------------------ */

r.post('/refresh', validate(z.object({ refreshToken: z.string() })), async (req, res) => {
  const { user, tokens } = await rotateRefreshToken(req.valid.body.refreshToken, (id) => User.findById(id));
  res.json({ user: user.toPublic(), ...tokens });
});

r.post('/logout', async (req, res) => {
  if (req.body?.refreshToken) await revokeRefreshToken(req.body.refreshToken);
  if (req.body?.fcmToken) await User.updateOne({ fcmTokens: req.body.fcmToken }, { $pull: { fcmTokens: req.body.fcmToken } });
  res.json({ ok: true });
});

/** Sign out every other device; this device gets fresh tokens. */
r.post('/logout-all', authenticate, async (req, res) => {
  const user = await User.findById(req.user._id);
  user.tokenVersion += 1;
  await user.save();
  await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
  await User.updateOne({ _id: user._id }, { $set: { fcmTokens: [] } });
  audit(user, 'auth.logoutAll', req);
  res.json({ ok: true, ...(await issueTokens(user, req.headers['user-agent'])) });
});

r.get('/me', authenticate, async (req, res) => {
  await req.user.populate([{ path: 'manager', select: 'name mobile' }, { path: 'distributor', select: 'name code tier' }, { path: 'territory', select: 'name code' }]);
  res.json({ user: req.user.toPublic() });
});

r.post('/change-password', authenticate, validate(z.object({ currentPassword: z.string().optional(), newPassword })), async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash');
  // OTP-only users may set a first password without the current one.
  if (user.passwordHash && !(await user.checkPassword(req.valid.body.currentPassword || ''))) throw badRequest('Current password is incorrect');
  await user.setPassword(req.valid.body.newPassword);
  user.tokenVersion += 1; // log out other devices
  await user.save();
  await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
  audit(user, 'auth.passwordChange', req);
  const tokens = await issueTokens(user, req.headers['user-agent']);
  res.json({ ok: true, ...tokens });
});

r.post('/fcm-token', authenticate, validate(z.object({ token: z.string().min(10) })), async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $addToSet: { fcmTokens: req.valid.body.token } });
  res.json({ ok: true });
});

export default r;
