import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, Card, Chips, Input, Screen, T, useBusy } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTheme } from '../theme';

export default function Login() {
  const t = useTheme();
  const { signIn } = useAuth();
  const [panel, setPanel] = useState('employee');
  const [mode, setMode] = useState('otp');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [run, busy] = useBusy();

  const done = async (s) => {
    await signIn(s);
    router.replace(s.user.userType === 'partner' ? '/partner/home' : '/employee/home');
  };

  const submit = () =>
    run(async () => {
      const id = identifier.trim();
      if (mode === 'password') return done(await api.post('/auth/login', { identifier: id, password, panel }));
      if (!otpSent) {
        const r = await api.post('/auth/otp/request', { identifier: id, panel });
        setOtpSent(true);
        setDevCode(r.devCode || '');
        return;
      }
      return done(await api.post('/auth/otp/verify', { identifier: id, code, panel }));
    });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']}>
        <View style={{ alignItems: 'center', gap: 8, marginTop: 40, marginBottom: 12 }}>
          <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
            <T size={20} weight="800" color={t.brandInk}>360°</T>
          </View>
          <T size={24} weight="800">AHCL 360</T>
          <T muted>Field, HR and distribution in one app</T>
        </View>
        <Card>
          <Chips
            label="I am a"
            options={[['employee', 'Employee'], ['partner', 'Channel Partner']]}
            value={panel}
            onChange={(v) => {
              setPanel(v);
              setOtpSent(false);
            }}
          />
          <Chips
            label="Sign in with"
            options={[['otp', 'OTP'], ['password', 'Password']]}
            value={mode}
            onChange={(v) => {
              setMode(v);
              setOtpSent(false);
            }}
          />
          <Input label={panel === 'partner' ? 'Registered mobile or email' : 'Mobile number or email'} value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="email-address" autoComplete="username" editable={!otpSent} />
          {mode === 'password' && <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />}
          {mode === 'otp' && otpSent && (
            <Input label="Enter 6-digit OTP" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} hint={devCode ? `Development OTP: ${devCode}` : 'OTP sent to your registered mobile'} autoFocus />
          )}
          <Button title={mode === 'otp' && !otpSent ? 'Send OTP' : 'Sign in'} onPress={submit} loading={busy} disabled={!identifier || (mode === 'password' && !password) || (otpSent && code.length !== 6)} />
          {otpSent && <Button title="Change number / resend" variant="ghost" onPress={() => { setOtpSent(false); setCode(''); }} />}
        </Card>
        <T muted size={12} style={{ textAlign: 'center' }}>Sessions sign out automatically after a period of inactivity.</T>
      </Screen>
    </KeyboardAvoidingView>
  );
}
