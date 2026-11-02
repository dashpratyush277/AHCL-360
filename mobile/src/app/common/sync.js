import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Card, Empty, KV, Screen, Section, T, useBusy } from '../../components/ui';
import { dt, label } from '../../lib/format';
import { clearFailed, discardFailed, flushQueue, onQueueChange, retryFailed } from '../../lib/offline';
import { useTheme } from '../../theme';

export default function Sync() {
  const t = useTheme();
  const [q, setQ] = useState({ pending: 0, failed: [], synced: 0 });
  const [run, busy] = useBusy();
  useEffect(() => onQueueChange(setQ), []);
  return (
    <Screen>
      <Card title="Offline data">
        <KV k="Waiting to sync" v={q.pending} />
        <KV k="Failed" v={q.failed.length} />
        <KV k="Synced from this phone" v={q.synced} />
        <KV k="Last synced" v={q.lastSyncAt ? dt(q.lastSyncAt) : 'Not yet'} />
        <T muted size={12}>Entries made without internet are stored on this device and sent automatically when you reconnect. Each entry is applied on the server exactly once, even if it is sent twice.</T>
        <Button title="Sync now" icon="sync" loading={busy} onPress={() => run(flushQueue)} />
      </Card>
      {q.failed.length > 0 && (
        <Section
          title="Could not be synced"
          right={<Button small variant="ghost" title="Clear all" onPress={() => Alert.alert('Discard all failed entries?', 'They will not be sent to the server.', [{ text: 'Keep', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: clearFailed }])} />}
        >
          {q.failed.map((f) => (
            <Card key={f.clientId} style={{ gap: 6 }}>
              <T weight="700">{label(f.type.replace('.', ' '))}</T>
              <T muted size={12}>Saved {dt(f.createdAt)}</T>
              <View style={{ backgroundColor: t.badSoft, padding: 8, borderRadius: 8 }}>
                <T color={t.bad} size={13}>{f.error}</T>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button small title="Try again" onPress={() => retryFailed(f.clientId)} />
                <Button small variant="ghost" title="Discard" onPress={() => discardFailed(f.clientId)} />
              </View>
            </Card>
          ))}
        </Section>
      )}
      {!q.pending && !q.failed.length && <Empty text="Everything is synced." />}
    </Screen>
  );
}
