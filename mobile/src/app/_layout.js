import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { attachPushListeners } from '../lib/push';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../lib/auth';
import '../lib/tracking'; // registers the background location task at startup
import { useTheme } from '../theme';

export default function RootLayout() {
  const t = useTheme();
  // Tapping a push notification opens the notification list.
  useEffect(() => attachPushListeners(() => router.push('/common/notifications')), []);
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: t.surface },
            headerTintColor: t.text,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: t.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="employee" options={{ headerShown: false }} />
          <Stack.Screen name="partner" options={{ headerShown: false }} />
          <Stack.Screen name="common" options={{ headerShown: false }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
