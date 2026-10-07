import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../theme';

export default function PartnerLayout() {
  const { ready, user } = useAuth();
  const t = useTheme();
  if (ready && !user) return <Redirect href="/login" />;
  if (user && user.userType !== 'partner') return <Redirect href="/employee/home" />;
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: t.surface }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="order-new" options={{ title: 'Place order' }} />
      <Stack.Screen name="order/[id]" options={{ title: 'Order details' }} />
      <Stack.Screen name="invoices" options={{ title: 'Invoices & billing' }} />
      <Stack.Screen name="claims" options={{ title: 'Claims & settlements' }} />
      <Stack.Screen name="claim-new" options={{ title: 'New claim', presentation: 'modal' }} />
      <Stack.Screen name="retailer-new" options={{ title: 'Onboard retailer', presentation: 'modal' }} />
      <Stack.Screen name="stock-entry" options={{ title: 'Stock entry', presentation: 'modal' }} />
    </Stack>
  );
}
