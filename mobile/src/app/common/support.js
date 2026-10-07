import { router } from 'expo-router';
import { Linking } from 'react-native';
import { Badge, Button, Card, Empty, KV, ListItem, Row, Screen, Section } from '../../components/ui';
import { dt } from '../../lib/format';
import { useApi } from '../../lib/hooks';

export default function Support() {
  const contact = useApi('/support/contact');
  const tickets = useApi('/support/tickets?limit=30');
  const c = contact.data;
  return (
    <Screen onRefresh={tickets.reload} refreshing={tickets.loading}>
      {c && (
        <Card title="Contact support">
          <KV k="Hours" v={c.hours} />
          <Row>
            <Button small icon="call-outline" title="Call" onPress={() => Linking.openURL(`tel:${c.phone}`)} />
            <Button small variant="ghost" icon="mail-outline" title="Email" onPress={() => Linking.openURL(`mailto:${c.email}`)} />
          </Row>
        </Card>
      )}
      <Button title="Raise a support ticket" icon="add" onPress={() => router.push('/common/ticket-new')} />
      <Section title="My tickets">
        {(tickets.data?.items || []).map((t) => (
          <ListItem key={t._id} title={`${t.ticketNo} · ${t.subject}`} subtitle={`Updated ${dt(t.updatedAt)}`} right={<Badge status={t.status} />} onPress={() => router.push(`/common/ticket/${t._id}`)} />
        ))}
        {!tickets.data?.items?.length && <Empty loading={tickets.loading} text="No tickets yet." />}
      </Section>
    </Screen>
  );
}
