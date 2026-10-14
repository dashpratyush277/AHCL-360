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
    // When true (dev only) the OTP is also returned in the API response for testing.
    exposeInResponse: !isProd && process.env.OTP_EXPOSE !== 'false',
    // Throttle: minimum seconds between OTP requests for the same number.
    resendSeconds: Number(process.env.OTP_RESEND_SECONDS || 30),
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

  // Firebase service account for FCM push: a file path (FIREBASE_SERVICE_ACCOUNT) or the JSON
  // itself base64-encoded (FIREBASE_SERVICE_ACCOUNT_BASE64, convenient on hosting platforms).
  firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT || '',
  firebaseServiceAccountBase64: process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '',

  sms: {
    // fast2sms | msg91 | twilio | webhook | console (default console in dev, webhook if SMS_WEBHOOK_URL set)
    provider: (process.env.SMS_PROVIDER || (process.env.SMS_WEBHOOK_URL ? 'webhook' : 'console')).toLowerCase(),
    countryCode: process.env.SMS_COUNTRY_CODE || '91',
    webhookUrl: process.env.SMS_WEBHOOK_URL || '',
    fast2sms: {
      apiKey: process.env.FAST2SMS_API_KEY || '',
      senderId: process.env.FAST2SMS_SENDER_ID || '',
      messageId: process.env.FAST2SMS_DLT_MESSAGE_ID || '',
    },
    msg91: {
      authKey: process.env.MSG91_AUTH_KEY || '',
      templateId: process.env.MSG91_TEMPLATE_ID || '',
      otpVar: process.env.MSG91_OTP_VAR || 'otp',
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      from: process.env.TWILIO_FROM || '',
    },
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'AHCL 360 <no-reply@example.com>',
  },

  // Serve the built admin panel (admin/dist) from the API so both share one domain.
  adminDir: process.env.ADMIN_DIST_DIR || '',
};
