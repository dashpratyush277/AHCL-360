import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Badge, Button, Card, Chips, Empty, KV, ListItem, Screen, T, useBusy } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { date, inr, label, thisMonth, time, today } from '../../lib/format';
import { useApi } from '../../lib/hooks';

/** Manager view: juniors' live status & GPS, performance matrix and pending approvals. */
export default function Team() {
  const [tab, setTab] = useState('status');
  return (
    <Screen>
      <Chips options={[['status', 'Today'], ['map', 'Live map'], ['performance', 'Performance'], ['approvals', 'Approvals']]} value={tab} onChange={setTab} />
      {tab === 'status' && <Status />}
      {tab === 'map' && <LiveMap />}
      {tab === 'performance' && <Performance />}
      {tab === 'approvals' && <Approvals />}
    </Screen>
  );
}

function Status() {
  const { data, loading } = useApi('/team/juniors');
  return (
    <>
      {(data?.items || []).map((u) => (
        <ListItem
          key={u._id}
          icon="person-outline"
          title={u.name}
          subtitle={`${u.profile?.designation || label(u.role)} · ${u.today?.checkIn ? `in ${time(u.today.checkIn.time)}${u.today.checkOut ? `, out ${time(u.today.checkOut.time)}` : ''}` : 'not checked in'}`}
          right={<Badge status={u.today ? u.today.status : 'absent'} />}
          onPress={() => router.push({ pathname: '/employee/route', params: { user: u._id, date: today() } })}
        />
      ))}
      {!data?.items?.length && <Empty loading={loading} text="No juniors are mapped to you." />}
    </>
  );
}

function LiveMap() {
  const { data, loading, reload } = useApi('/tracking/live');
  const items = data?.items || [];
  return (
    <>
      <Button small variant="ghost" icon="refresh" title="Refresh" onPress={reload} />
      {items.length ? (
        <View style={{ height: 420, borderRadius: 12, overflow: 'hidden' }}>
          <MapView style={{ flex: 1 }} initialRegion={{ latitude: items[0].lat, longitude: items[0].lng, latitudeDelta: 0.2, longitudeDelta: 0.2 }}>
            {items.map((i) => (
              <Marker key={i.user?._id} coordinate={{ latitude: i.lat, longitude: i.lng }} title={i.user?.name} description={`Last seen ${time(i.recordedAt)}`} />
            ))}
          </MapView>
        </View>
      ) : (
        <Empty loading={loading} text="No team member has shared a location in the last 30 minutes." />
      )}
    </>
  );
}

function Performance() {
  const { data, loading } = useApi(`/team/performance?period=${thisMonth()}`);
  return (
    <>
      <T muted size={12}>Score = 40% sales + 25% visits + 20% attendance + 15% reporting</T>
      {(data?.items || []).map((r) => (
        <Card key={r.user._id} title={r.user.name} right={<T size={20} weight="800">{r.score}</T>}>
          <KV k="Sales" v={`${inr(r.sales.achieved)} / ${inr(r.sales.target)}${r.sales.percent != null ? ` (${r.sales.percent}%)` : ''}`} />
          <KV k="Visits" v={`${r.visits.count} / ${r.visits.target ?? '-'}`} />
          <KV k="Attendance" v={`${r.attendance.present}/${r.attendance.workingDays} days (${r.attendance.percent}%)`} />
          <KV k="Distance" v={`${r.distanceKm} km`} />
          <KV k="Reports approved" v={`${r.reports.approved}/${r.reports.submitted}${r.reports.avgRating ? ` · ★${r.reports.avgRating}` : ''}`} />
          {r.visits.invalidLocation > 0 && <Badge status="rejected" text={`${r.visits.invalidLocation} location mismatch(es)`} />}
        </Card>
      ))}
      {!data?.items?.length && <Empty loading={loading} />}
    </>
  );
}

function Approvals() {
  const leaves = useApi(`/hr/leaves${qs({ scope: 'team', status: 'pending' })}`);
  const expenses = useApi(`/expenses${qs({ scope: 'team', status: 'pending', from: '2000-01-01' })}`);
  const [run, busy] = useBusy();
  const act = (path, body, reload) => run(() => api.post(path, body)).then(reload);
  return (
    <>
      <T weight="700">Leave requests</T>
      {(leaves.data?.items || []).map((l) => (
        <Card key={l._id} title={l.user?.name}>
          <T>{label(l.type)} · {l.days} day(s): {date(l.from)} – {date(l.to)}</T>
          <T muted>{l.reason}</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button small title="Approve" disabled={busy} onPress={() => act(`/hr/leaves/${l._id}/review`, { status: 'approved' }, leaves.reload)} />
            <Button small variant="danger" title="Reject" disabled={busy} onPress={() => act(`/hr/leaves/${l._id}/review`, { status: 'rejected' }, leaves.reload)} />
          </View>
        </Card>
      ))}
      {!leaves.data?.items?.length && <Empty loading={leaves.loading} text="No pending leave requests." />}
      <T weight="700">Expense claims</T>
      {(expenses.data?.items || []).map((e) => (
        <Card key={e._id} title={`${e.user?.name} · ${inr(e.amount)}`}>
          <T>{label(e.category)} on {date(e.date)}{e.distanceKm != null ? ` · ${e.distanceKm} km${e.autoCalculated ? ' (GPS)' : ''}` : ''}</T>
          {e.description ? <T muted>{e.description}</T> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button small title="Approve" disabled={busy} onPress={() => act(`/expenses/${e._id}/review`, { status: 'approved' }, expenses.reload)} />
            <Button small variant="danger" title="Reject" disabled={busy} onPress={() => act(`/expenses/${e._id}/review`, { status: 'rejected' }, expenses.reload)} />
          </View>
        </Card>
      ))}
      {!expenses.data?.items?.length && <Empty loading={expenses.loading} text="No pending expense claims." />}
    </>
  );
}
