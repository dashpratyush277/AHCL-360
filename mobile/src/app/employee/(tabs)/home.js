import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import SyncBanner from '../../../components/SyncBanner';
import { Badge, Button, Card, KV, ListItem, Row, Screen, Section, Stat, StatRow, T, useBusy } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { inr, time } from '../../../lib/format';
import { useApi } from '../../../lib/hooks';
import { submitOrQueue } from '../../../lib/offline';
import { currentPosition, syncTracking } from '../../../lib/tracking';

export default function Home() {
  const { user } = useAuth();
  const today = useApi('/attendance/today');
  const dash = useApi('/analytics/dashboard');
  const targets = useApi('/targets');
  const notes = useApi('/notifications?limit=1');
  const [tracking, setTracking] = useState({ running: false });
  const [run, busy] = useBusy();

  const att = today.data?.attendance;
  const checkedIn = Boolean(att?.checkIn?.time) && !att?.checkOut?.time;

  useFocusEffect(
    useCallback(() => {
      if (today.data) syncTracking({ checkedIn }).then(setTracking).catch(() => {});
    }, [today.data, checkedIn]),
  );

  const punch = (kind) =>
    run(async () => {
      const pos = await currentPosition();
      const type = kind === 'in' ? 'attendance.checkIn' : 'attendance.checkOut';
      const r = await submitOrQueue(type, { ...pos, time: new Date().toISOString() }, (p) => api.post(`/attendance/check-${kind}`, p));
      if (r.queued) Alert.alert('Saved offline', 'Your attendance will sync automatically when you are back online.');
      else if (r.result?.checkIn && r.result.checkIn.withinGeofence === false && kind === 'in') Alert.alert('Checked in', 'Note: you are outside the office geofence. This has been flagged for your manager.');
      await today.reload();
      setTracking(await syncTracking({ checkedIn: kind === 'in' }));
    });

  const refresh = () => Promise.all([today.reload(), dash.reload(), targets.reload(), notes.reload()]);
  const month = targets.data?.items?.[0];
  const d = dash.data;

  return (
    <Screen onRefresh={refresh} refreshing={today.loading}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size={20} weight="800">Hi, {user?.name?.split(' ')[0]}</T>
        <Button small variant="ghost" icon="notifications-outline" title={notes.data?.unread ? String(notes.data.unread) : undefined} onPress={() => router.push('/common/notifications')} />
      </Row>
      <SyncBanner />

      <Card title="Attendance" right={<Badge status={att?.checkOut ? 'approved' : checkedIn ? 'present' : 'pending'} text={att?.checkOut ? 'Day complete' : checkedIn ? 'Checked in' : 'Not checked in'} />}>
        <KV k="Office hours" v={`${today.data?.officeHours?.start || '--'} – ${today.data?.officeHours?.end || '--'}`} />
        <KV k="Check-in" v={time(att?.checkIn?.time)} />
        <KV k="Check-out" v={time(att?.checkOut?.time)} />
        {att?.checkIn && att.checkIn.withinGeofence === false && <T size={12} muted>Check-in was outside the office geofence.</T>}
        <KV k="GPS tracking" v={tracking.running ? 'Active' : tracking.reason || 'Off'} />
        {!att?.checkIn && <Button title="Check in" icon="log-in-outline" onPress={() => punch('in')} loading={busy} />}
        {checkedIn && <Button title="Check out" variant="danger" icon="log-out-outline" onPress={() => punch('out')} loading={busy} />}
      </Card>

      <StatRow>
        <Stat label="Visits today" value={d?.visitsToday ?? '-'} onPress={() => router.push('/employee/visits')} />
        <Stat label="My sales (month)" value={d ? inr(d.salesThisMonth) : '-'} onPress={() => router.push('/employee/sales')} />
      </StatRow>
      {user?.role === 'manager' && (
        <StatRow>
          <Stat label="Team present" value={d ? `${d.presentToday}/${d.teamSize}` : '-'} onPress={() => router.push('/employee/team')} />
          <Stat label="Pending approvals" value={d ? d.pendingLeaves + d.pendingExpenses : '-'} onPress={() => router.push('/employee/team')} />
        </StatRow>
      )}

      {month && (
        <Card title={`Target vs achievement · ${month.period}`} onPress={() => router.push('/employee/sales')}>
          {month.target ? (
            <>
              <KV k="Sales" v={`${inr(month.achieved.salesAmount)} / ${inr(month.target.salesAmount)} (${month.percent.salesAmount ?? 0}%)`} />
              <KV k="Visits" v={`${month.achieved.visits} / ${month.target.visits} (${month.percent.visits ?? 0}%)`} />
              <KV k="New retailers" v={`${month.achieved.newRetailers} / ${month.target.newRetailers}`} />
            </>
          ) : (
            <T muted>No target set for this period.</T>
          )}
        </Card>
      )}

      <Section title="Quick actions">
        <ListItem icon="add-circle-outline" title="Start a client visit" onPress={() => router.push('/employee/visit-new')} />
        <ListItem icon="receipt-outline" title="Daily sales order" onPress={() => router.push('/employee/dso-new')} />
        <ListItem icon="document-text-outline" title="Submit today's work report" onPress={() => router.push('/employee/work-report')} />
        <ListItem icon="wallet-outline" title="Claim travel expense" onPress={() => router.push('/employee/expense-new')} />
        <ListItem icon="map-outline" title="Today's route map" onPress={() => router.push('/employee/route')} />
      </Section>
    </Screen>
  );
}
