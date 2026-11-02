import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import ServerSettings from '../components/ServerSettings';
import { Button, Card, Chips, Input, Screen, T, useBusy } from '../components/ui';
import { api, getApiUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTheme } from '../theme';

const isRelease = Constants.expoConfig?.extra?.variant === 'production';
const version = Constants.expoConfig?.version || '1.0.0';

/** Role cards (from the approved AHCL login design). */
const ROLES = [
  { key: 'employee', title: 'Employee Login', sub: 'Field Sales & Operations  |  HR  |  Expenses', icon: 'person', tile: 'blue', panel: 'employee' },
  { key: 'manager', title: 'Manager Login', sub: 'Team & Performance  |  Approvals', icon: 'people', tile: 'green', panel: 'employee', roles: ['manager', 'admin', 'super_admin'] },
  { key: 'partner', title: 'Distributor Login', sub: 'Stock & Orders  |  Schemes  |  Claims', icon: 'cube', tile: 'orange', panel: 'partner' },
  { key: 'retailer', title: 'Retailer Login', sub: 'Billing & Retail  |  Offers  |  Self Service', icon: 'storefront', tile: 'purple', soon: true },
  { key: 'admin', title: 'Super Admin Login', sub: 'Full Control Panel  |  Master Data  |  Reports', icon: 'shield-checkmark', tile: 'red', web: true },
];

const HIGHLIGHTS = [
  ['people', 'People', 'Connected'],
  ['cube', 'Products', 'Wider Reach'],
  ['stats-chart', 'Performance', 'Greater Efficiency'],
  ['leaf', 'Growth', 'A Stronger Tomorrow'],
];
const FEATURES = [
  ['lock-closed-outline', 'Secure Access', 'Your Data, Our Priority'],
  ['cloud-outline', 'Cloud Sync', 'Real-time Updates'],
  ['phone-portrait-outline', 'Any Device', 'Mobile • Tablet • Web'],
  ['globe-outline', 'Anywhere Access', 'Works Offline Too'],
];

const isMobile = (v) => /^(\+?91[\s-]?)?0?[6-9]\d{4}[\s-]?\d{5}$/.test(v.trim());
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function Login() {
  const t = useTheme();
  const [role, setRole] = useState(null);

  const pick = (r) => {
    if (r.soon) {
      return Alert.alert('Retailer Login – coming soon', 'Retailer self-service will be enabled after AHCL approves its scope. Retailers are currently onboarded by distributors and field staff.');
    }
    if (r.web) {
      const url = getApiUrl().replace(/\/api\/?$/, '');
      return Alert.alert('Super Admin', 'The admin control panel opens in your browser.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open admin panel', onPress: () => Linking.openURL(url) },
      ]);
    }
    setRole(r);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Screen edges={['top', 'bottom']} padded={false}>
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Image source={require('../../assets/logo.png')} style={{ width: 150, height: 100 }} resizeMode="contain" accessibilityLabel="AHCL – ADC Hindustan Corporation Limited" />
        </View>

        <Hero />

        <View style={{ padding: 16, gap: 12 }}>
          {role ? (
            <SignInForm role={role} onBack={() => setRole(null)} />
          ) : (
            ROLES.map((r) => <RoleCard key={r.key} role={r} onPress={() => pick(r)} />)
          )}

          <View style={[styles.featureStrip, { backgroundColor: t.surface2, borderColor: t.border }]}>
            {FEATURES.map(([icon, title, sub]) => (
              <View key={title} style={styles.feature}>
                <Ionicons name={icon} size={22} color={t.text} />
                <Text style={[styles.featureTitle, { color: t.text }]}>{title}</Text>
                <Text style={[styles.featureSub, { color: t.muted }]}>{sub}</Text>
              </View>
            ))}
          </View>

          {!isRelease && <ServerSettings />}
          <View style={{ alignItems: 'center', gap: 2, paddingVertical: 8 }}>
            <View style={{ width: 48, height: 3, borderRadius: 2, backgroundColor: t.brand, marginBottom: 6 }} />
            <T size={11} weight="700" style={{ letterSpacing: 1.5 }}>ADC HINDUSTAN CORPORATION LIMITED</T>
            <T muted size={11}>Version {version}  |  Confidential  |  AHCL 360</T>
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Hero() {
  const t = useTheme();
  return (
    <View style={[styles.hero, { backgroundColor: t.navy }]}>
      <Text style={styles.heroKicker}>WELCOME TO</Text>
      <Text style={styles.heroTitle}>
        AHCL <Text style={{ color: t.accent }}>360°</Text>
      </Text>
      <Text style={styles.heroTag}>ONE ENTERPRISE.{'\n'}EVERY ROLE.{'\n'}ONE PLATFORM.</Text>
      <View style={{ width: 40, height: 3, backgroundColor: t.accent, borderRadius: 2, marginTop: 10 }} />
      <View style={styles.heroRow}>
        {HIGHLIGHTS.map(([icon, title, sub], i) => (
          <View key={title} style={[styles.heroItem, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(255,255,255,0.35)' }]}>
            <Ionicons name={icon} size={20} color="#FFFFFF" />
            <Text style={styles.heroItemTitle}>{title}</Text>
            <Text style={styles.heroItemSub}>{sub}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function RoleCard({ role, onPress }) {
  const t = useTheme();
  const tile = t.tiles[role.tile];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${role.title}. ${role.sub}${role.soon ? '. Coming soon' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.roleCard, { backgroundColor: t.surface, borderColor: t.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.roleTile, { backgroundColor: tile.bg }]}>
        <Ionicons name={role.icon} size={26} color={tile.fg} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[styles.roleTitle, { color: t.text }]}>{role.title}</Text>
          {role.soon && (
            <View style={{ backgroundColor: t.surface2, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: t.muted, fontSize: 11, fontWeight: '700' }}>Coming soon</Text>
            </View>
          )}
        </View>
        <Text style={[styles.roleSub, { color: t.muted }]}>{role.sub}</Text>
      </View>
      <View style={[styles.chevron, { backgroundColor: t.brandSoft }]}>
        <Ionicons name={role.web ? 'open-outline' : 'chevron-forward'} size={18} color={t.brand} />
      </View>
    </Pressable>
  );
}

function SignInForm({ role, onBack }) {
  const t = useTheme();
  const { signIn } = useAuth();
  const [mode, setMode] = useState('otp'); // otp | password | reset
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const [run, busy] = useBusy();

  const idValid = isMobile(identifier) || isEmail(identifier);
  const idError = touched && identifier && !idValid ? 'Enter a 10-digit mobile number or a valid email' : undefined;
  const weak = newPassword && (newPassword.length < 8 || !/\d/.test(newPassword) || !/[A-Za-z]/.test(newPassword));

  const finish = async (s) => {
    if (role.roles && !role.roles.includes(s.user.role)) {
      api.post('/auth/logout', { refreshToken: s.refreshToken }).catch(() => {});
      throw new Error('This account is not a manager account. Please use Employee Login.');
    }
    await signIn(s);
    router.replace(s.user.userType === 'partner' ? '/partner/home' : '/employee/home');
  };

  const submit = () => {
    setTouched(true);
    setError('');
    if (!idValid) return;
    run(async () => {
      try {
        const id = identifier.trim();
        if (mode === 'password') return await finish(await api.post('/auth/login', { identifier: id, password, panel: role.panel }));
        if (!otpSent) {
          const r = await api.post('/auth/otp/request', { identifier: id, panel: role.panel });
          setOtpSent(true);
          setDevCode(r.devCode || '');
          return;
        }
        if (mode === 'reset') {
          await finish(await api.post('/auth/password/reset', { identifier: id, code, newPassword, panel: role.panel }));
          return Alert.alert('Password changed', 'Your new password is active. Other devices have been signed out.');
        }
        return await finish(await api.post('/auth/otp/verify', { identifier: id, code, panel: role.panel }));
      } catch (e) {
        setError(e.isNetwork ? 'Cannot reach the server. Check your internet connection and try again.' : e.message);
      }
    });
  };

  const switchMode = (m) => {
    setMode(m);
    setOtpSent(false);
    setCode('');
    setError('');
  };

  const cta = mode === 'password' ? 'Sign in' : !otpSent ? 'Send OTP' : mode === 'reset' ? 'Set new password' : 'Verify & sign in';
  const disabled = !identifier || (mode === 'password' && !password) || (otpSent && code.length !== 6) || (mode === 'reset' && otpSent && (!newPassword || weak));

  return (
    <Card>
      <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back to login options" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="arrow-back" size={18} color={t.brand} />
        <T color={t.brand} weight="600">All login options</T>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[styles.roleTile, { backgroundColor: t.tiles[role.tile].bg }]}>
          <Ionicons name={role.icon} size={26} color={t.tiles[role.tile].fg} />
        </View>
        <View style={{ flex: 1 }}>
          <T size={18} weight="800">{mode === 'reset' ? 'Reset password' : role.title}</T>
          <T muted size={13}>{role.sub}</T>
        </View>
      </View>
      {mode !== 'reset' && <Chips options={[['otp', 'OTP'], ['password', 'Password']]} value={mode} onChange={switchMode} />}
      <Input
        label="Registered mobile number or email"
        value={identifier}
        onChangeText={(v) => { setIdentifier(v); setError(''); }}
        onBlur={() => setTouched(true)}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="username"
        editable={!otpSent}
        error={idError}
        placeholder="98765 43210"
      />
      {mode === 'password' && <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submit} />}
      {otpSent && (
        <Input
          label="6-digit OTP"
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          hint={devCode ? `Demo mode – your OTP is ${devCode}` : 'Sent to your registered mobile number'}
        />
      )}
      {mode === 'reset' && otpSent && (
        <Input label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry error={weak ? 'At least 8 characters with a letter and a digit' : undefined} />
      )}
      {error ? (
        <View accessibilityLiveRegion="polite" style={{ backgroundColor: t.badSoft, padding: 10, borderRadius: 8 }}>
          <T color={t.bad} size={13}>{error}</T>
        </View>
      ) : null}
      <Button title={busy ? 'Please wait…' : cta} onPress={submit} loading={busy} disabled={disabled} />
      {otpSent && <Button title="Change number / resend OTP" variant="ghost" onPress={() => { setOtpSent(false); setCode(''); }} />}
      {mode === 'password' && <Button title="Forgot password?" variant="ghost" onPress={() => switchMode('reset')} />}
      {mode === 'reset' && <Button title="Back to sign in" variant="ghost" onPress={() => switchMode('password')} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: 16, borderRadius: 18, padding: 20, gap: 4, overflow: 'hidden' },
  heroKicker: { color: '#CFE3F5', fontSize: 13, letterSpacing: 2, fontWeight: '600' },
  heroTitle: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', letterSpacing: 0.5 },
  heroTag: { color: '#FFFFFF', fontSize: 15, letterSpacing: 2, fontWeight: '600', lineHeight: 22, marginTop: 2 },
  heroRow: { flexDirection: 'row', marginTop: 18 },
  heroItem: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  heroItemTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', marginTop: 4 },
  heroItemSub: { color: '#CFE3F5', fontSize: 10, textAlign: 'center' },
  roleCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, borderWidth: 1, minHeight: 76 },
  roleTile: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  roleTitle: { fontSize: 17, fontWeight: '800' },
  roleSub: { fontSize: 12.5 },
  chevron: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  featureStrip: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, paddingVertical: 12, marginTop: 4 },
  feature: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 2 },
  featureTitle: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  featureSub: { fontSize: 9.5, textAlign: 'center' },
});
