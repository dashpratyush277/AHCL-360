import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Button, Card, Chips, Input, ListItem, Screen, T, useBusy } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { submitOrQueue } from '../../lib/offline';
import { currentPosition } from '../../lib/tracking';

const PURPOSES = ['Order collection', 'Product demo', 'Payment follow-up', 'New retailer', 'Stock audit', 'Complaint', 'Other'];

export default function VisitNew() {
  const [clientType, setClientType] = useState('retailer');
  const [search, setSearch] = useState('');
  const [client, setClient] = useState(null);
  const [clientName, setClientName] = useState('');
  const [purpose, setPurpose] = useState(PURPOSES[0]);
  const [notes, setNotes] = useState('');
  const [run, busy] = useBusy();

  const listPath = clientType === 'retailer' ? `/retailers${qs({ q: search, limit: 10 })}` : clientType === 'distributor' ? `/distributors${qs({ q: search, limit: 10 })}` : null;
  const list = useApi(client ? null : listPath);

  const submit = () =>
    run(async () => {
      const pos = await currentPosition();
      const payload = {
        clientType,
        clientName: client ? client.shopName || client.name : clientName,
        retailer: clientType === 'retailer' ? client?._id : undefined,
        distributor: clientType === 'distributor' ? client?._id : undefined,
        purpose,
        notes: notes || undefined,
        ...pos,
        time: new Date().toISOString(),
      };
      const r = await submitOrQueue('visit.create', payload, (p) => api.post('/visits', p));
      if (r.queued) Alert.alert('Saved offline', 'The visit will sync when you are online.');
      else if (r.result.locationValid === false) Alert.alert('Location mismatch', r.result.locationRemark);
      router.back();
    });

  return (
    <Screen>
      <Card>
        <Chips label="Client type" options={['retailer', 'distributor', 'prospect', 'other']} value={clientType} onChange={(v) => { setClientType(v); setClient(null); }} />
        {['retailer', 'distributor'].includes(clientType) && !client && (
          <>
            <Input label={`Search ${clientType}`} value={search} onChangeText={setSearch} placeholder="Name, shop, code…" />
            {(list.data?.items || []).map((c) => (
              <ListItem key={c._id} title={c.shopName || c.name} subtitle={c.code || c.distributorCode || c.city} onPress={() => setClient(c)} />
            ))}
          </>
        )}
        {client && (
          <ListItem icon="checkmark-circle" title={client.shopName || client.name} subtitle="Tap to change" onPress={() => setClient(null)} />
        )}
        {['prospect', 'other'].includes(clientType) && <Input label="Client name" value={clientName} onChangeText={setClientName} />}
        <Chips label="Purpose" options={PURPOSES.map((p) => [p, p])} value={purpose} onChange={setPurpose} />
        <Input label="Notes" value={notes} onChangeText={setNotes} multiline />
        <T muted size={12}>Your current GPS location and time are recorded at check-in and validated against the client&apos;s registered location.</T>
        <Button title="Check in at client" icon="location" loading={busy} disabled={!client && !clientName} onPress={submit} />
      </Card>
    </Screen>
  );
}
