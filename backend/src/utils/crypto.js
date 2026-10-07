import crypto from 'node:crypto';
import { env } from '../config/env.js';

const KEY = Buffer.from(env.encryptionKey, 'hex');
if (KEY.length !== 32) throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');

const PREFIX = 'enc:v1:';

/** AES-256-GCM encrypt a string. Output: enc:v1:<iv>.<tag>.<ciphertext> (base64). */
export function encryptString(plain) {
  if (plain === undefined || plain === null || plain === '') return plain;
  if (typeof plain === 'string' && plain.startsWith(PREFIX)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${data.toString('base64')}`;
}

export function decryptString(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
  const [iv, tag, data] = value.slice(PREFIX.length).split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Encrypt a file buffer: [12-byte iv][16-byte tag][ciphertext]. */
export function encryptBuffer(buf) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(buf), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}

export function decryptBuffer(buf) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
}

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('base64url');
export const randomOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

/** Show only the last 4 characters, e.g. for Aadhaar/PAN in list views. */
export const mask = (s) => (s ? `${'*'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}` : s);

/**
 * Mongoose plugin: transparently encrypt the given string paths at rest.
 * Values are stored encrypted and decrypted by the getter when read.
 */
export function encryptedFieldsPlugin(schema, { fields = [] } = {}) {
  for (const path of fields) {
    schema.path(path).set(encryptString);
    schema.path(path).get(decryptString);
  }
  schema.set('toJSON', { ...(schema.get('toJSON') || {}), getters: true });
  schema.set('toObject', { ...(schema.get('toObject') || {}), getters: true });
}
