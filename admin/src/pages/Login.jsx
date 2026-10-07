import { useState } from 'react';
import { Button, Card, Field, Tabs } from '../components/ui.jsx';
import { api, setSession } from '../lib/api';

export default function Login() {
  const [mode, setMode] = useState('password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    go(async () => {
      if (mode === 'password') {
        setSession(await api.post('/auth/login', { identifier, password, panel: 'admin' }));
      } else if (!otpSent) {
        const r = await api.post('/auth/otp/request', { identifier, panel: 'admin' });
        setOtpSent(true);
        setDevCode(r.devCode || '');
      } else {
        setSession(await api.post('/auth/otp/verify', { identifier, code: otp, panel: 'admin' }));
      }
    });
  };

  return (
    <div className="login">
      <Card>
        <h1>AHCL 360° Admin</h1>
        <p className="muted" style={{ marginTop: 0 }}>Sign in with your admin or manager account.</p>
        <Tabs tabs={[['password', 'Password'], ['otp', 'OTP']]} value={mode} onChange={(m) => { setMode(m); setOtpSent(false); setError(''); }} />
        <form className="stack" onSubmit={submit}>
          <Field label="Mobile or email">
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required autoFocus />
          </Field>
          {mode === 'password' && (
            <Field label="Password">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Field>
          )}
          {mode === 'otp' && otpSent && (
            <Field label="6-digit OTP" hint={devCode ? `Dev mode OTP: ${devCode}` : 'Sent to your mobile/email'}>
              <input inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} required />
            </Field>
          )}
          {error && <div className="error-box">{error}</div>}
          <Button disabled={busy}>{busy ? 'Please wait…' : mode === 'otp' && !otpSent ? 'Send OTP' : 'Sign in'}</Button>
        </form>
      </Card>
    </div>
  );
}
