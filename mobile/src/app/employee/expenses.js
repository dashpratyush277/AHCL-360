import { router } from 'expo-router';
import { useState } from 'react';
import { Badge, Button, Card, Chips, Empty, KV, ListItem, Screen } from '../../components/ui';
import { qs } from '../../lib/api';
import { date, inr, label } from '../../lib/format';
import { useApi } from '../../lib/hooks';

export default function Expenses() {
  const [status, setStatus] = useState('');
  const list = useApi(`/expenses${qs({ status, from: '2000-01-01', limit: 50 })}`);
  const totals = Object.fromEntries((list.data?.totals || []).map((t) => [t._id, t.amount]));

  return (
    <Screen onRefresh={list.reload} refreshing={list.loading}>
      <Button title="New expense claim" icon="add" onPress={() => router.push('/employee/expense-new')} />
      <Card title="Summary">
        {['pending', 'approved', 'reimbursed', 'rejected'].map((s) => <KV key={s} k={label(s)} v={inr(totals[s] || 0)} />)}
      </Card>
      <Chips options={[['', 'All'], 'pending', 'approved', 'reimbursed', 'rejected']} value={status} onChange={setStatus} />
      {(list.data?.items || []).map((e) => (
        <ListItem
          key={e._id}
          icon={e.category === 'travel' ? 'car-outline' : 'receipt-outline'}
          title={`${label(e.category)} · ${inr(e.amount)}`}
          subtitle={[
            date(e.date),
            e.distanceKm != null ? `${e.distanceKm} km${e.autoCalculated ? ' (GPS)' : ''} × ₹${e.ratePerKm}` : null,
            e.bills?.length ? `${e.bills.length} bill(s)` : null,
            e.reviewComment ? `“${e.reviewComment}”` : null,
          ].filter(Boolean).join(' · ')}
          right={<Badge status={e.status} />}
        />
      ))}
      {!list.data?.items?.length && <Empty loading={list.loading} text="No expense claims yet." />}
    </Screen>
  );
}
