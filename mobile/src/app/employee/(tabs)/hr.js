import { router } from 'expo-router';
import { Alert } from 'react-native';
import { Badge, Button, Card, Empty, KV, ListItem, Screen, Section } from '../../../components/ui';
import { api } from '../../../lib/api';
import { date, label } from '../../../lib/format';
import { useApi } from '../../../lib/hooks';

export default function Hr() {
  const leaves = useApi('/hr/leaves?limit=10');
  const balance = useApi('/hr/leaves/balance');
  const month = useApi('/attendance/month');

  const cancel = (l) =>
    Alert.alert('Cancel leave request?', `${label(l.type)} leave from ${date(l.from)}`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel request', style: 'destructive', onPress: () => api.post(`/hr/leaves/${l._id}/cancel`).then(leaves.reload) },
    ]);

  return (
    <Screen onRefresh={() => Promise.all([leaves.reload(), balance.reload(), month.reload()])} refreshing={leaves.loading}>
      {month.data && (
        <Card title={`Attendance · ${month.data.month}`} onPress={() => router.push('/employee/attendance')}>
          <KV k="Present" v={month.data.summary.present} />
          <KV k="Half day" v={month.data.summary.halfDay} />
          <KV k="Absent" v={month.data.summary.absent} />
          <KV k="On leave" v={month.data.summary.leave} />
        </Card>
      )}

      <Card title="Leave balance" right={<Button small icon="add" title="Apply" onPress={() => router.push('/employee/leave-new')} />}>
        {balance.data && Object.entries(balance.data).map(([k, b]) => <KV key={k} k={label(k)} v={`${b.available} of ${b.quota} left`} />)}
      </Card>

      <Section title="My leave requests">
        {(leaves.data?.items || []).map((l) => (
          <ListItem
            key={l._id}
            title={`${label(l.type)} · ${l.days} day(s)`}
            subtitle={`${date(l.from)} – ${date(l.to)}${l.reviewComment ? `\n“${l.reviewComment}”` : ''}`}
            right={<Badge status={l.status} />}
            onPress={l.status === 'pending' ? () => cancel(l) : undefined}
          />
        ))}
        {!leaves.data?.items?.length && <Empty loading={leaves.loading} text="No leave requests yet." />}
      </Section>

      <Section title="HR services">
        <ListItem icon="calendar-outline" title="Monthly attendance & report" onPress={() => router.push('/employee/attendance')} />
        <ListItem icon="sunny-outline" title="Holiday calendar" onPress={() => router.push('/employee/holidays')} />
        <ListItem icon="cash-outline" title="Payslips & salary summary" onPress={() => router.push('/employee/payslips')} />
        <ListItem icon="folder-open-outline" title="Document vault" subtitle="Offer letter, ID proofs and more" onPress={() => router.push('/employee/documents')} />
        <ListItem icon="shield-checkmark-outline" title="KYC submission" onPress={() => router.push('/employee/kyc')} />
      </Section>
    </Screen>
  );
}
