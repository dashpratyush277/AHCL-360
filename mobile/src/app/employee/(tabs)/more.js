import { router } from 'expo-router';
import { Alert } from 'react-native';
import SyncBanner from '../../../components/SyncBanner';
import { Card, ListItem, Screen, Section, T } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { label } from '../../../lib/format';

export default function More() {
  const { user, signOut } = useAuth();
  const isManager = ['manager', 'admin', 'super_admin'].includes(user?.role);
  return (
    <Screen>
      <Card>
        <T size={18} weight="800">{user?.name}</T>
        <T muted>{label(user?.role)} · {user?.employeeCode || user?.mobile}</T>
      </Card>
      <SyncBanner />
      <Section title="Work">
        <ListItem icon="wallet-outline" title="Expenses" subtitle="Travel claims, bills, reimbursement status" onPress={() => router.push('/employee/expenses')} />
        <ListItem icon="document-text-outline" title="Daily work report" onPress={() => router.push('/employee/work-report')} />
        <ListItem icon="bar-chart-outline" title="Reports" subtitle="PDF / Excel downloads" onPress={() => router.push('/employee/reports')} />
      </Section>
      {isManager && (
        <Section title="Team management">
          <ListItem icon="people-outline" title="My team" subtitle="Live status, GPS, performance" onPress={() => router.push('/employee/team')} />
          <ListItem icon="checkbox-outline" title="Review work reports" onPress={() => router.push('/employee/team-reports')} />
        </Section>
      )}
      <Section title="Account">
        <ListItem icon="notifications-outline" title="Notifications" onPress={() => router.push('/common/notifications')} />
        <ListItem icon="person-circle-outline" title="Profile & password" onPress={() => router.push('/common/profile')} />
        <ListItem icon="help-buoy-outline" title="Help & support" onPress={() => router.push('/common/support')} />
        <ListItem
          icon="log-out-outline"
          title="Log out"
          onPress={() =>
            Alert.alert('Log out?', 'Background GPS tracking will stop.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Log out', style: 'destructive', onPress: async () => { await signOut(); router.replace('/login'); } },
            ])
          }
        />
      </Section>
    </Screen>
  );
}
