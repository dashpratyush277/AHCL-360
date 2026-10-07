import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Badge, Button, Card, Empty, KV, ListItem, Row, Screen, Section, T, useBusy } from '../../../components/ui';
import { api } from '../../../lib/api';
import { dt, time, today } from '../../../lib/format';
import { useApi } from '../../../lib/hooks';
import { submitOrQueue } from '../../../lib/offline';
import { currentPosition } from '../../../lib/tracking';

export default function Visits() {
  const [day, setDay] = useState(today());
  const list = useApi(`/visits?date=${day}&from=${day}&to=${day}&limit=100`);
  const recent = useApi('/visits?limit=15');
  const [run, busy] = useBusy();
  const items = list.data?.items || [];
  const open = items.find((v) => !v.checkOut?.time);

  const checkOut = (v) =>
    run(async () => {
      const pos = await currentPosition();
      const r = await submitOrQueue('visit.checkOut', { ...pos, visitId: v._id, time: new Date().toISOString() }, (p) => api.post(`/visits/${v._id}/check-out`, p));
      if (r.queued) Alert.alert('Saved offline', 'Check-out will sync when you are online.');
      else if (r.result?.locationValid === false) Alert.alert('Location mismatch', r.result.locationRemark);
      list.reload();
    });

  const shift = (n) => {
    const d = new Date(`${day}T12:00:00+05:30`);
    d.setDate(d.getDate() + n);
    setDay(today(d));
  };

  return (
    <Screen onRefresh={() => Promise.all([list.reload(), recent.reload()])} refreshing={list.loading}>
      {open ? (
        <Card title="Visit in progress" right={<Badge status="in_progress" />}>
          <KV k="Client" v={open.clientName} />
          <KV k="Purpose" v={open.purpose} />
          <KV k="Checked in" v={time(open.checkIn.time)} />
          <KV k="Distance travelled" v={`${open.distanceKm} km`} />
          {!open.locationValid && <T size={12} muted>{open.locationRemark}</T>}
          <Button title="Check out" variant="danger" icon="log-out-outline" loading={busy} onPress={() => checkOut(open)} />
        </Card>
      ) : (
        <Button title="Start new visit" icon="add" onPress={() => router.push('/employee/visit-new')} />
      )}

      <Row style={{ justifyContent: 'space-between' }}>
        <Button small variant="ghost" icon="chevron-back" onPress={() => shift(-1)} />
        <T weight="700">{day === today() ? 'Today' : day}</T>
        <Button small variant="ghost" icon="chevron-forward" disabled={day >= today()} onPress={() => shift(1)} />
      </Row>
      <Button small variant="soft" icon="map-outline" title="View route map for this day" onPress={() => router.push({ pathname: '/employee/route', params: { date: day } })} />

      <Section title={`Visits (${items.length}) · ${items.reduce((a, v) => a + (v.distanceKm || 0), 0).toFixed(1)} km`}>
        {items.length ? (
          items.map((v) => (
            <ListItem
              key={v._id}
              icon={v.clientType === 'distributor' ? 'business-outline' : 'storefront-outline'}
              title={v.clientName}
              subtitle={`${v.purpose} · ${time(v.checkIn.time)}–${time(v.checkOut?.time)} · ${v.distanceKm} km`}
              right={<Badge status={v.locationValid ? 'approved' : 'rejected'} text={v.locationValid ? 'GPS ok' : 'Mismatch'} />}
            />
          ))
        ) : (
          <Empty loading={list.loading} error={list.error} text="No visits logged on this day." />
        )}
      </Section>

      {day === today() && (
        <Section title="Recent visits">
          {(recent.data?.items || []).filter((v) => v.date !== day).slice(0, 8).map((v) => (
            <ListItem key={v._id} title={v.clientName} subtitle={`${v.purpose} · ${dt(v.checkIn.time)}`} />
          ))}
        </Section>
      )}
    </Screen>
  );
}
