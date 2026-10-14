import { useState } from 'react';
import { Alert } from 'react-native';
import { Button, Card, Input, KV, Screen, T, useBusy } from '../../components/ui';
import { api, getSession, setSession } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { pushAvailable, registerForPush } from '../../lib/push';
import { date, label } from '../../lib/format';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [address, setAddress] = useState(user?.profile?.address || '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [run, busy] = useBusy();

  const saveProfile = () =>
    run(async () => {
      await api.patch('/profile', { name, email: email || undefined, profile: { address: address || undefined } });
      await refreshUser();
      Alert.alert('Profile updated');
    });

  const changePassword = () =>
    run(async () => {
      const r = await api.post('/auth/change-password', { currentPassword: current || undefined, newPassword: next });
      // Server rotates tokens and signs out other devices.
      await setSession({ ...getSession(), accessToken: r.accessToken, refreshToken: r.refreshToken });
      setCurrent('');
      setNext('');
      setConfirm('');
      Alert.alert('Password changed', 'Other devices have been signed out.');
    });

  const weak = next && (next.length < 8 || !/\d/.test(next) || !/[A-Za-z]/.test(next));

  return (
    <Screen>
      <Card title="Account">
        <KV k="Mobile" v={user?.mobile} />
        <KV k="Role" v={label(user?.role)} />
        {user?.employeeCode ? <KV k="Employee code" v={user.employeeCode} /> : null}
        {user?.manager?.name ? <KV k="Reports to" v={user.manager.name} /> : null}
        {user?.distributor?.code ? <KV k="Distributor" v={`${user.distributor.name} (${user.distributor.code})`} /> : null}
        {user?.profile?.dateOfJoining ? <KV k="Joined" v={date(user.profile.dateOfJoining)} /> : null}
      </Card>
      <Card title="Edit profile">
        <Input label="Name" value={name} onChangeText={setName} />
        <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Input label="Address" value={address} onChangeText={setAddress} multiline />
        <Button title="Save profile" loading={busy} onPress={saveProfile} />
      </Card>
      <Card title="Push notifications">
        <T muted size={12}>
          {pushAvailable()
            ? 'Sends a test notification to this phone through Firebase Cloud Messaging.'
            : 'Push notifications need the installed AHCL 360 app (not Expo Go). In-app notifications still work.'}
        </T>
        <Button
          title="Send test notification"
          variant="soft"
          loading={busy}
          disabled={!pushAvailable()}
          onPress={() =>
            run(async () => {
              await registerForPush();
              const r = await api.post('/notifications/test', {});
              Alert.alert(
                r.pushed ? 'Sent' : 'Not delivered as push',
                r.pushed
                  ? 'A notification should appear on this phone in a few seconds.'
                  : !r.push?.enabled
                    ? 'The server has no Firebase credentials yet (FIREBASE_SERVICE_ACCOUNT). It was saved to your in-app notifications.'
                    : r.devices === 0
                      ? 'This phone has not registered for push. Allow notifications for the app and try again.'
                      : 'Firebase did not accept the message. Check the server log.',
              );
            })
          }
        />
      </Card>
      <Card title="Change password">
        <T muted size={12}>If you only use OTP login, leave the current password empty to set one.</T>
        <Input label="Current password" value={current} onChangeText={setCurrent} secureTextEntry />
        <Input label="New password" value={next} onChangeText={setNext} secureTextEntry error={weak ? 'At least 8 characters with a letter and a digit' : undefined} />
        <Input label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry error={confirm && confirm !== next ? 'Passwords do not match' : undefined} />
        <Button title="Change password" loading={busy} disabled={!next || weak || next !== confirm} onPress={changePassword} />
      </Card>
    </Screen>
  );
}
