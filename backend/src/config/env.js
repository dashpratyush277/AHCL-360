import 'dotenv/config';

const required = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') throw new Error(`Missing required env var: ${name}`);
  return value;
};

const isProd = process.env.NODE_ENV === 'production';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  port: Number(process.env.PORT || 4000),
  // Empty MONGO_URI in development starts an in-memory MongoDB (see config/db.js).
  mongoUri: process.env.MONGO_URI || '',
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()),

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', isProd ? undefined : 'dev-access-secret-change-me'),
    refreshSecret: required('JWT_REFRESH_SECRET', isProd ? undefined : 'dev-refresh-secret-change-me'),
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS || 30),
  },

  // Refresh tokens unused for longer than this are rejected => auto logout after inactivity.
  idleTimeoutMinutes: Number(process.env.IDLE_TIMEOUT_MINUTES || 30),

  // 32-byte key (64 hex chars) used for AES-256-GCM encryption of sensitive fields and files.
  encryptionKey: required(
    'ENCRYPTION_KEY',
    isProd ? undefined : '0000000000000000000000000000000000000000000000000000000000000000',
  ),

  otp: {
    ttlMinutes: Number(process.env.OTP_TTL_MINUTES || 5),
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
    // When true (dev only) the OTP is returned in the API response instead of being sent by SMS.
    exposeInResponse: !isProd && process.env.OTP_EXPOSE !== 'false',
  },

  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),

  expenseRatesPerKm: {
    bike: Number(process.env.RATE_PER_KM_BIKE || 3.5),
    car: Number(process.env.RATE_PER_KM_CAR || 9),
    public: Number(process.env.RATE_PER_KM_PUBLIC || 2),
  },

  company: {
    name: process.env.COMPANY_NAME || 'AHCL',
    gstin: process.env.COMPANY_GSTIN || '00AAAAA0000A1Z5',
    address: process.env.COMPANY_ADDRESS || 'Registered Office Address',
    stateCode: process.env.COMPANY_STATE_CODE || '21',
    supportPhone: process.env.SUPPORT_PHONE || '+91-0000000000',
    supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com',
  },

  // Path to a Firebase service-account JSON. When unset, push notifications are logged only.
  firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT || '',
  // Optional HTTP SMS gateway; when unset OTPs are logged to the console.
  smsWebhookUrl: process.env.SMS_WEBHOOK_URL || '',
};
