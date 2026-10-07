import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { forbidden, unauthorized } from '../utils/http.js';

/** Verifies the Bearer access token and loads req.user. Rejects blocked / revoked users. */
export async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.access_token;
  if (!token) throw unauthorized('Missing access token');

  let payload;
  try {
    payload = jwt.verify(token, env.jwt.accessSecret);
  } catch {
    throw unauthorized('Invalid or expired token');
  }
  const user = await User.findById(payload.sub);
  if (!user) throw unauthorized('User not found');
  if (user.isBlocked) throw forbidden('Account is blocked. Contact admin.');
  if (user.tokenVersion !== payload.ver) throw unauthorized('Session expired, please log in again');

  req.user = user;
  next();
}

/** Allow only the listed roles. */
export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.flat().includes(req.user.role)) throw forbidden('Insufficient role');
    next();
  };

/** Allow only 'employee' or 'partner' logins. */
export const requireUserType = (type) => (req, _res, next) => {
  if (req.user.userType !== type) throw forbidden(`Only ${type} accounts can access this`);
  next();
};
