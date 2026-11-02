import { useState } from 'react';
import logo from '../assets/logo.png';
import { Button, Card, Field } from '../components/ui.jsx';
import { api, setSession } from '../lib/api';

/**
 * Admin sign-in: password, then (when the server requires it) a one-time code sent to the
 * admin's registered mobile – two-factor authentication for the control panel.
 */
export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mfa, setMfa] = useState(null); // { mfaToken, devCode }
  const [code, setCode] = useState('');
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
      if (!mfa) {
        const r = await api.post('/auth/login', { identifier, password, panel: 'admin' });
        if (r.mfaRequired) setMfa({ mfaToken: r.mfaToken, devCode: r.devCode });
        else setSession(r);
      } else {
        setSession(await api.post('/auth/mfa/verify', { mfaToken: mfa.mfaToken, code }));
      }
    });
  };

  return (
    <div className="login">
      <div className="login-panel">
        <div className="login-hero">
          <img src={logo} alt="AHCL – ADC Hindustan Corporation Limited" className="login-logo" />
          <div className="login-band">
            <div className="kicker">WELCOME TO</div>
            <div className="title">AHCL <span>360°</span></div>
            <div className="tag">SUPER ADMIN · CONTROL PANEL</div>
          </div>
        </div>
        <Card>
          <form className="stack" onSubmit={submit}>
            {!mfa ? (
              <>
                <Field label="Mobile or email">
                  <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required autoFocus />
                </Field>
                <Field label="Password">
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                </Field>
              </>
            ) : (
              <Field label="Verification code" hint={mfa.devCode ? `Demo mode – code: ${mfa.devCode}` : 'We sent a 6-digit code to your registered mobile.'}>
                <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus />
              </Field>
            )}
            {error && <div className="error-box" role="alert">{error}</div>}
            <Button disabled={busy || (mfa && code.length !== 6)}>{busy ? 'Please wait…' : mfa ? 'Verify & sign in' : 'Sign in'}</Button>
            {mfa && (
              <Button type="button" variant="ghost" onClick={() => { setMfa(null); setCode(''); }}>
                Start again
              </Button>
            )}
          </form>
        </Card>
        <p className="muted login-foot">ADC Hindustan Corporation Limited · Confidential · Sessions end after inactivity</p>
      </div>
    </div>
  );
}
