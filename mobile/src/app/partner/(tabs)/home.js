import { router } from 'expo-router';
import SyncBanner from '../../../components/SyncBanner';
import { Badge, Button, Card, ListItem, Row, Screen, Section, Stat, StatRow, T } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { date, inr, label } from '../../../lib/format';
import { useApi } from '../../../lib/hooks';

export default function PartnerHome() {
  const { user } = useAuth();
  const dash = useApi('/analytics/dashboard');
  const orders = useApi('/orders?limit=5');
  const reorder = useApi('/stock/reorder-suggestions');
  const notes = useApi('/notifications?limit=1');
  const d = dash.data;

  return (
    <Screen onRefresh={() => Promise.all([dash.reload(), orders.reload(), reorder.reload(), notes.reload()])} refreshing={dash.loading}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={4} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <T size={20} weight="800">{user?.distributor?.name || user?.name}</T>
          <T muted>{label(user?.role)}{user?.distributor?.code ? ` · ${user.distributor.code}` : ''}</T>
        </Row>
        <Button small variant="ghost" icon="notifications-outline" title={notes.data?.unread ? String(notes.data.unread) : undefined} onPress={() => router.push('/common/notifications')} />
      </Row>
      <SyncBanner />
      <Button title="Place new order" icon="add" onPress={() => router.push('/partner/order-new')} />
      <StatRow>
        <Stat label="Orders this month" value={d?.monthOrders ?? '-'} hint={d ? inr(d.monthOrderValue) : undefined} onPress={() => router.push('/partner/orders')} />
        <Stat label="Open orders" value={d?.openOrders ?? '-'} onPress={() => router.push('/partner/orders')} />
      </StatRow>
      <StatRow>
        <Stat label="Stock units" value={d?.stockUnits ?? '-'} hint={d?.lowStockSkus ? `${d.lowStockSkus} SKU(s) low` : undefined} onPress={() => router.push('/partner/stock')} />
        <Stat label="Retailers" value={d?.retailers ?? '-'} onPress={() => router.push('/partner/retailers')} />
      </StatRow>
      {d?.pendingClaims > 0 && <ListItem icon="time-outline" title={`${d.pendingClaims} claim(s) awaiting decision`} onPress={() => router.push('/partner/claims')} />}

      {reorder.data?.items?.length > 0 && (
        <Card title="Reorder suggestions" right={<Button small variant="soft" title="Order now" onPress={() => router.push({ pathname: '/partner/order-new', params: { prefill: JSON.stringify(Object.fromEntries(reorder.data.items.map((r) => [r.productId, r.suggestedQty]))) } })} />}>
          {reorder.data.items.slice(0, 5).map((r) => (
            <Row key={r.productId} style={{ justifyContent: 'space-between' }}>
              <T style={{ flex: 1 }}>{r.name}</T>
              <T muted>{r.closing} left · order {r.suggestedQty}</T>
            </Row>
          ))}
        </Card>
      )}

      <Section title="Recent orders">
        {(orders.data?.items || []).map((o) => (
          <ListItem key={o._id} title={o.orderNo} subtitle={`${date(o.createdAt)} · ${inr(o.grandTotal)}`} right={<Badge status={o.status} />} onPress={() => router.push(`/partner/order/${o._id}`)} />
        ))}
      </Section>
    </Screen>
  );
}
