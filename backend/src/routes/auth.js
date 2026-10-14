import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Otp, RefreshToken, User } from '../models/index.js';
import { deliverOtp } from '../services/otpDelivery.js';
import { issueTokens, revokeRefreshToken, rotateRefreshToken } from '../services/tokens.js';
import { randomOtp, sha256 } from '../utils/crypto.js';
import { HttpError, badRequest, forbidden, unauthorized } from '../utils/http.js';

const tooMany = (msg) => new HttpError(429, msg);

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });

const identifier = z.string().trim().min(5).max(100);
// panel: which app panel the user is logging into; prevents partners logging into the employee panel and vice versa.
const panel = z.enum(['employee', 'partner', 'admin']).optional();

/** Find a user by email, or by mobile in any common format (+91 98765 43210, 09876543210, ...). */
function findByIdentifier(id) {
  const v = id.trim().toLowerCase();
  if (v.includes('@')) return User.findOne({ email: v }).select('+passwordHash');
  const digits = v.replace(/\D/g, '');
  const last10 = digits.slice(-10);
  const variants = [...new Set([id.trim(), digits, last10, `+91${last10}`, `91${last10}`, `0${last10}`])];
  return User.findOne({ mobile: { $in: variants } }).select('+passwordHash');
}

function assertPanel(user, p) {
  if (user.isBlocked) throw forbidden('Account is blocked. Contact admin.');
  if (p === 'admin' && !['super_admin', 'admin', 'manager'].includes(user.role)) throw forbidden('No admin panel access');
  if ((p === 'employee' || p === 'partner') && user.userType !== p) throw forbidden(`This account cannot log into the ${p} panel`);
}

async function completeLogin(user, req, res) {
  user.lastLoginAt = new Date();
  if (req.body.fcmToken) await User.updateOne({ _id: user._id }, { $addToSet: { fcmTokens: req.body.fcmToken } });
  await user.save();
  const tokens = await issueTokens(user, req.headers['user-agent']);
  await user.populate([{ path: 'manager', select: 'name mobile' }, { path: 'distributor', select: 'name code tier' }, { path: 'territory', select: 'name code' }]);
  res.json({ user: user.toPublic(), ...tokens });
}

r.post('/otp/request', limiter, validate(z.object({ identifier, panel })), async (req, res) => {
  const { identifier: id, panel: p } = req.valid.body;
  const user = await findByIdentifier(id);
  // Respond identically when the user doesn't exist to avoid account enumeration.
  if (!user) return res.json({ sent: true });
  assertPanel(user, p);
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
  // Send to the registered contact, not to whatever format was typed.
  const destination = id.includes('@') ? user.email : user.mobile;
  try {
    await deliverOtp(destination, code);
  } catch (err) {
    await otp.deleteOne();
    console.error('[otp] delivery failed:', err.message);
    throw Object.assign(new Error('Could not send the OTP right now. Please try again or sign in with your password.'), { status: 502, expose: true });
  }
  res.json({ sent: true, resendAfterSeconds: env.otp.resendSeconds, ...(env.otp.exposeInResponse ? { devCode: code } : {}) });
});

r.post('/otp/verify', limiter, validate(z.object({ identifier, code: z.string().length(6), panel, fcmToken: z.string().optional() })), async (req, res) => {
  const { identifier: id, code, panel: p } = req.valid.body;
  const user = await findByIdentifier(id);
  const otp = user && (await Otp.findOne({ identifier: String(user._id) }));
  if (!otp || otp.expiresAt < new Date()) throw unauthorized('OTP expired, request a new one');
  if (otp.attempts >= env.otp.maxAttempts) throw unauthorized('Too many attempts, request a new OTP');
  if (otp.codeHash !== sha256(code)) {
    otp.attempts += 1;
    await otp.save();
    throw unauthorized('Incorrect OTP');
  }
  await otp.deleteOne();
  assertPanel(user, p);
  await completeLogin(user, req, res);
});

r.post('/login', limiter, validate(z.object({ identifier, password: z.string().min(1), panel, fcmToken: z.string().optional() })), async (req, res) => {
  const { identifier: id, password, panel: p } = req.valid.body;
  const user = await findByIdentifier(id);
  if (!user || !(await user.checkPassword(password))) throw unauthorized('Invalid credentials');
  assertPanel(user, p);
  await completeLogin(user, req, res);
});

r.post('/refresh', validate(z.object({ refreshToken: z.string() })), async (req, res) => {
  const { user, tokens } = await rotateRefreshToken(req.valid.body.refreshToken, (id) => User.findById(id));
  res.json({ user: user.toPublic(), ...tokens });
});

r.post('/logout', async (req, res) => {
  if (req.body?.refreshToken) await revokeRefreshToken(req.body.refreshToken);
  if (req.body?.fcmToken) await User.updateOne({ fcmTokens: req.body.fcmToken }, { $pull: { fcmTokens: req.body.fcmToken } });
  res.json({ ok: true });
});

r.get('/me', authenticate, async (req, res) => {
  await req.user.populate([{ path: 'manager', select: 'name mobile' }, { path: 'distributor', select: 'name code tier' }, { path: 'territory', select: 'name code' }]);
  res.json({ user: req.user.toPublic() });
});

r.post(
  '/change-password',
  authenticate,
  validate(z.object({ currentPassword: z.string().optional(), newPassword: z.string().min(8).regex(/[A-Za-z]/).regex(/\d/, 'Must contain a digit') })),
  async (req, res) => {
    const user = await User.findById(req.user._id).select('+passwordHash');
    // OTP-only users may set a first password without the current one.
    if (user.passwordHash && !(await user.checkPassword(req.valid.body.currentPassword || ''))) throw badRequest('Current password is incorrect');
    await user.setPassword(req.valid.body.newPassword);
    user.tokenVersion += 1; // log out other devices
    await user.save();
    await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
    const tokens = await issueTokens(user, req.headers['user-agent']);
    res.json({ ok: true, ...tokens });
  },
);

r.post('/fcm-token', authenticate, validate(z.object({ token: z.string().min(10) })), async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $addToSet: { fcmTokens: req.valid.body.token } });
  res.json({ ok: true });
});

export default r;
