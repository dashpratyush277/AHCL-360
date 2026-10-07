import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { RefreshToken } from '../models/index.js';
import { randomToken, sha256 } from '../utils/crypto.js';
import { unauthorized } from '../utils/http.js';

export function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role, type: user.userType, ver: user.tokenVersion }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtl,
  });
}

/** Opaque refresh token stored hashed; supports rotation, idle timeout and revocation. */
export async function issueTokens(user, device) {
  const refreshToken = randomToken();
  await RefreshToken.create({
    user: user._id,
    tokenHash: sha256(refreshToken),
    tokenVersion: user.tokenVersion,
    device,
    expiresAt: new Date(Date.now() + env.jwt.refreshTtlDays * 86_400_000),
  });
  return { accessToken: signAccessToken(user), refreshToken, idleTimeoutMinutes: env.idleTimeoutMinutes };
}

export async function rotateRefreshToken(token, loadUser) {
  const record = await RefreshToken.findOne({ tokenHash: sha256(token) });
  if (!record || record.revokedAt || record.expiresAt < new Date()) throw unauthorized('Invalid refresh token');

  // Auto logout after inactivity
  if (Date.now() - record.lastUsedAt.getTime() > env.idleTimeoutMinutes * 60_000) {
    record.revokedAt = new Date();
    await record.save();
    throw unauthorized('Session timed out due to inactivity');
  }

  const user = await loadUser(record.user);
  if (!user || user.isBlocked || user.tokenVersion !== record.tokenVersion) throw unauthorized('Session revoked');

  record.revokedAt = new Date();
  await record.save();
  return { user, tokens: await issueTokens(user, record.device) };
}

export const revokeRefreshToken = (token) =>
  RefreshToken.updateOne({ tokenHash: sha256(token) }, { revokedAt: new Date() });
