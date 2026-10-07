import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Badge, Button, Card, Empty, Input, Screen, T, useBusy } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { dt, label } from '../../../lib/format';
import { useApi } from '../../../lib/hooks';
import { useTheme } from '../../../theme';

export default function Ticket() {
  const th = useTheme();
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const { data: t, loading, reload } = useApi(`/support/tickets/${id}`);
  const [text, setText] = useState('');
  const [run, busy] = useBusy();
  if (!t) return <Empty loading={loading} />;
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <Card title={t.subject} right={<Badge status={t.status} />}>
        <T muted>{t.ticketNo} · {label(t.category)} · {label(t.priority)} priority</T>
      </Card>
      {t.messages.map((m, i) => {
        const mine = String(m.from?._id) === String(user?._id);
        return (
          <Card key={i} style={{ backgroundColor: mine ? th.brandSoft : th.surface, marginLeft: mine ? 32 : 0, marginRight: mine ? 0 : 32 }}>
            <T muted size={12}>{mine ? 'You' : `${m.from?.name} (Support)`} · {dt(m.at)}</T>
            <T>{m.text}</T>
          </Card>
        );
      })}
      {t.status !== 'closed' && (
        <Card>
          <Input placeholder="Write a reply…" value={text} onChangeText={setText} multiline />
          <Button title="Send" loading={busy} disabled={!text.trim()} onPress={() => run(async () => { await api.post(`/support/tickets/${id}/messages`, { text }); setText(''); reload(); })} />
        </Card>
      )}
    </Screen>
  );
}
