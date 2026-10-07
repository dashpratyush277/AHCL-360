import { router } from 'expo-router';
import { useState } from 'react';
import { Badge, Button, Chips, Empty, ListItem, Screen } from '../../../components/ui';
import { qs } from '../../../lib/api';
import { date, inr } from '../../../lib/format';
import { useApi } from '../../../lib/hooks';

export default function Orders() {
  const [status, setStatus] = useState('');
  const list = useApi(`/orders${qs({ status, limit: 50 })}`);
  return (
    <Screen onRefresh={list.reload} refreshing={list.loading}>
      <Button title="Place new order" icon="add" onPress={() => router.push('/partner/order-new')} />
      <Chips options={[['', 'All'], 'processing', 'packed', 'shipped', 'delivered', 'cancelled']} value={status} onChange={setStatus} />
      {(list.data?.items || []).map((o) => (
        <ListItem
          key={o._id}
          icon="cube-outline"
          title={o.orderNo}
          subtitle={`${date(o.createdAt)} · ${o.items.length} item(s) · ${inr(o.grandTotal)}${o.invoice ? ` · ${o.invoice.invoiceNo}` : ''}`}
          right={<Badge status={o.status} />}
          onPress={() => router.push(`/partner/order/${o._id}`)}
        />
      ))}
      {!list.data?.items?.length && <Empty loading={list.loading} error={list.error} text="No orders yet." />}
    </Screen>
  );
}
