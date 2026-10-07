import { useEffect, useState } from 'react';
import { Button, Card, Empty, KV, ListItem, Screen, Section, T, useBusy } from '../../components/ui';
import { dt, label } from '../../lib/format';
import { clearFailed, flushQueue, onQueueChange } from '../../lib/offline';

export default function Sync() {
  const [q, setQ] = useState({ pending: 0, failed: [] });
  const [run, busy] = useBusy();
  useEffect(() => onQueueChange(setQ), []);
  return (
    <Screen>
      <Card title="Offline data">
        <KV k="Waiting to sync" v={q.pending} />
        <KV k="Failed" v={q.failed.length} />
        <T muted size={12}>Entries made without internet are stored on this device and sent automatically when you reconnect.</T>
        <Button title="Sync now" icon="sync" loading={busy} onPress={() => run(flushQueue)} />
      </Card>
      {q.failed.length > 0 && (
        <Section title="Could not be synced" right={<Button small variant="ghost" title="Clear" onPress={clearFailed} />}>
          {q.failed.map((f) => (
            <ListItem key={f.clientId} icon="alert-circle-outline" title={label(f.type.replace('.', ' '))} subtitle={`${dt(f.createdAt)}\n${f.error}`} />
          ))}
        </Section>
      )}
      {!q.pending && !q.failed.length && <Empty text="Everything is synced." />}
    </Screen>
  );
}
