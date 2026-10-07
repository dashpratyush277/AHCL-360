import { router } from 'expo-router';
import { Alert } from 'react-native';
import { Card, ListItem, Screen, Section, T } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { label } from '../../../lib/format';

export default function More() {
  const { user, signOut } = useAuth();
  return (
    <Screen>
      <Card>
        <T size={18} weight="800">{user?.name}</T>
        <T muted>{label(user?.role)} · {user?.mobile}</T>
      </Card>
      <Section title="Billing">
        <ListItem icon="document-text-outline" title="Invoices" subtitle="GST invoices & downloads" onPress={() => router.push('/partner/invoices')} />
        <ListItem icon="pricetags-outline" title="Claims & settlements" subtitle="Schemes, discounts, damages" onPress={() => router.push('/partner/claims')} />
      </Section>
      <Section title="Account">
        <ListItem icon="notifications-outline" title="Notifications" onPress={() => router.push('/common/notifications')} />
        <ListItem icon="person-circle-outline" title="Profile & password" onPress={() => router.push('/common/profile')} />
        <ListItem icon="help-buoy-outline" title="Help & support" onPress={() => router.push('/common/support')} />
        <ListItem
          icon="log-out-outline"
          title="Log out"
          onPress={() =>
            Alert.alert('Log out?', undefined, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Log out', style: 'destructive', onPress: async () => { await signOut(); router.replace('/login'); } },
            ])
          }
        />
      </Section>
    </Screen>
  );
}
