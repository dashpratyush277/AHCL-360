import { env } from '../config/env.js';

/**
 * Delivers login OTPs by SMS (mobile numbers) or email (email addresses).
 *
 * SMS_PROVIDER:
 *  - fast2sms : Fast2SMS DLT route  (FAST2SMS_API_KEY, FAST2SMS_SENDER_ID, FAST2SMS_DLT_MESSAGE_ID)
 *  - msg91    : MSG91 Flow API      (MSG91_AUTH_KEY, MSG91_TEMPLATE_ID, MSG91_OTP_VAR)
 *  - twilio   : Twilio Messaging    (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)
 *  - webhook  : POST {to, message} to SMS_WEBHOOK_URL (any other gateway)
 *  - console  : print to server log (development only)
 *
 * Indian SMS requires a DLT-registered sender ID and an approved template, e.g.
 *   "{#var#} is your AHCL 360 login OTP. Valid for 5 minutes. Do not share it. - AHCL"
 * The OTP is passed as the template's first variable.
 *
 * Email OTP uses SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM).
 */

export class DeliveryError extends Error {
  constructor(message) {
    super(message);
    this.status = 502;
  }
}

/** 9876543210 / +91 98765 43210 / 919876543210 -> 919876543210 (country code, digits only) */
export function normalizeMobile(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `${env.sms.countryCode}${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `${env.sms.countryCode}${digits.slice(1)}`;
  return digits;
}

const text = (code) => `${code} is your ${env.company.name} 360 login OTP. Valid for ${env.otp.ttlMinutes} minutes. Do not share it.`;

async function check(res, provider) {
  const body = await res.text();
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }
  // Fast2SMS returns {return:false} with HTTP 200 on errors; MSG91 returns {type:"error"}.
  const failed = !res.ok || json?.return === false || json?.type === 'error';
  if (failed) throw new DeliveryError(`${provider} rejected the SMS: ${json?.message || body.slice(0, 200)}`);
  return json;
}

const providers = {
  async fast2sms(mobile, code) {
    const s = env.sms.fast2sms;
    // Fast2SMS expects 10-digit Indian numbers.
    const number = mobile.startsWith('91') && mobile.length === 12 ? mobile.slice(2) : mobile;
    const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: { authorization: s.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ route: 'dlt', sender_id: s.senderId, message: s.messageId, variables_values: code, numbers: number }),
    });
    return check(res, 'Fast2SMS');
  },

  // NOTE: verify against your MSG91 account (template variable name) before go-live.
  async msg91(mobile, code) {
    const s = env.sms.msg91;
    const res = await fetch('https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: { authkey: s.authKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ template_id: s.templateId, short_url: '0', recipients: [{ mobiles: mobile, [s.otpVar]: code }] }),
    });
    return check(res, 'MSG91');
  },

  async twilio(mobile, code) {
    const s = env.sms.twilio;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${s.accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${s.accountSid}:${s.authToken}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: `+${mobile}`, From: s.from, Body: text(code) }),
    });
    return check(res, 'Twilio');
  },

  async webhook(mobile, code) {
    const res = await fetch(env.sms.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: mobile, message: text(code), otp: code }),
    });
    return check(res, 'SMS webhook');
  },

  async console(mobile, code) {
    console.log(`[otp] SMS to ${mobile}: ${code}`);
  },
};

let transporter;
async function sendEmail(to, code) {
  if (!env.smtp.host) {
    if (env.isProd) throw new DeliveryError('Email OTP is not configured (SMTP_HOST)');
    console.log(`[otp] email to ${to}: ${code}`);
    return;
  }
  if (!transporter) {
    const nodemailer = (await import('nodemailer')).default;
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  await transporter.sendMail({
    from: env.smtp.from,
    to,
    subject: `${code} is your ${env.company.name} 360 login code`,
    text: `${text(code)}\n\nIf you did not try to sign in, ignore this email.`,
  });
}

export async function deliverOtp(identifier, code) {
  if (identifier.includes('@')) return sendEmail(identifier, code);
  const provider = providers[env.sms.provider];
  if (!provider) throw new DeliveryError(`Unknown SMS_PROVIDER "${env.sms.provider}"`);
  try {
    await provider(normalizeMobile(identifier), code);
  } catch (err) {
    if (err instanceof DeliveryError) throw err;
    throw new DeliveryError(`Could not reach SMS provider: ${err.message}`);
  }
}

/** Startup check so a misconfigured production server fails loudly instead of silently. */
export function smsConfigProblems() {
  const p = env.sms.provider;
  const need = {
    fast2sms: ['apiKey', 'senderId', 'messageId'],
    msg91: ['authKey', 'templateId'],
    twilio: ['accountSid', 'authToken', 'from'],
  }[p];
  const problems = [];
  if (need) for (const k of need) if (!env.sms[p][k]) problems.push(`SMS_PROVIDER=${p} needs ${k}`);
  if (p === 'webhook' && !env.sms.webhookUrl) problems.push('SMS_PROVIDER=webhook needs SMS_WEBHOOK_URL');
  if (p === 'console' && env.isProd && !env.demoMode) problems.push('SMS_PROVIDER=console is not allowed in production');
  return problems;
}
