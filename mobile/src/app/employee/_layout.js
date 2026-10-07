import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../theme';

export default function EmployeeLayout() {
  const { ready, user } = useAuth();
  const t = useTheme();
  if (ready && !user) return <Redirect href="/login" />;
  if (user && user.userType !== 'employee') return <Redirect href="/partner/home" />;
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: t.surface }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="visit-new" options={{ title: 'New visit', presentation: 'modal' }} />
      <Stack.Screen name="route" options={{ title: 'Route map' }} />
      <Stack.Screen name="distributor/[id]" options={{ title: 'Distributor' }} />
      <Stack.Screen name="stock-entry" options={{ title: 'Stock entry', presentation: 'modal' }} />
      <Stack.Screen name="dso-new" options={{ title: 'Daily sales order', presentation: 'modal' }} />
      <Stack.Screen name="leave-new" options={{ title: 'Apply for leave', presentation: 'modal' }} />
      <Stack.Screen name="attendance" options={{ title: 'Attendance' }} />
      <Stack.Screen name="holidays" options={{ title: 'Holiday calendar' }} />
      <Stack.Screen name="payslips" options={{ title: 'Payslips & salary' }} />
      <Stack.Screen name="documents" options={{ title: 'Document vault' }} />
      <Stack.Screen name="kyc" options={{ title: 'KYC submission' }} />
      <Stack.Screen name="expenses" options={{ title: 'Expenses' }} />
      <Stack.Screen name="expense-new" options={{ title: 'New expense claim', presentation: 'modal' }} />
      <Stack.Screen name="work-report" options={{ title: 'Daily work report', presentation: 'modal' }} />
      <Stack.Screen name="team" options={{ title: 'My team' }} />
      <Stack.Screen name="team-reports" options={{ title: 'Team work reports' }} />
      <Stack.Screen name="reports" options={{ title: 'Reports' }} />
    </Stack>
  );
}
