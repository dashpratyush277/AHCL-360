import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../theme';

/** Screens shared by both panels: notifications, support, profile, offline sync. */
export default function CommonLayout() {
  const { ready, user } = useAuth();
  const t = useTheme();
  if (ready && !user) return <Redirect href="/login" />;
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: t.surface }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg } }}>
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="support" options={{ title: 'Help & support' }} />
      <Stack.Screen name="ticket/[id]" options={{ title: 'Ticket' }} />
      <Stack.Screen name="ticket-new" options={{ title: 'New ticket', presentation: 'modal' }} />
      <Stack.Screen name="profile" options={{ title: 'Profile & security' }} />
      <Stack.Screen name="sync" options={{ title: 'Offline sync' }} />
    </Stack>
  );
}
