import { router } from 'expo-router';
import { useState } from 'react';
import { Badge, Button, Card, Chips, Empty, ListItem, Row, Screen, Section, T, useBusy } from '../../../components/ui';
import { api } from '../../../lib/api';
import { date, label, today } from '../../../lib/format';
import { useApi } from '../../../lib/hooks';

export default function Stock() {
  const [tab, setTab] = useState('closing');
  const stock = useApi('/stock');
  const reorder = useApi('/stock/reorder-suggestions');
  const txns = useApi('/stock/txns?limit=30&from=2000-01-01');
  const [run, busy] = useBusy();
  const entry = (type) => router.push({ pathname: '/partner/stock-entry', params: { type } });

  return (
    <Screen onRefresh={() => Promise.all([stock.reload(), reorder.reload(), txns.reload()])} refreshing={stock.loading}>
      <Row style={{ flexWrap: 'wrap' }}>
        <Button small icon="arrow-down" title="Stock in" onPress={() => entry('in')} />
        <Button small icon="arrow-up" title="Stock out" onPress={() => entry('out')} />
        <Button small variant="soft" icon="construct-outline" title="Adjust" onPress={() => entry('adjustment')} />
        <Button small variant="ghost" icon="download-outline" title="Statement" disabled={busy} onPress={() => run(() => api.downloadAndShare(`/reports/stock?from=${today().slice(0, 8)}01&to=${today()}&format=pdf`, 'Stock-statement.pdf'))} />
      </Row>
      <Chips options={[['closing', 'Closing stock'], ['reorder', `Reorder (${reorder.data?.items?.length ?? 0})`], ['ledger', 'Movements']]} value={tab} onChange={setTab} />

      {tab === 'closing' && (
        <Section title="Closing stock (calculated)">
          {(stock.data?.items || []).map((s) => (
            <Card key={s.productId} style={{ padding: 12, gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T weight="700" style={{ flex: 1 }}>{s.name}</T>
                <T weight="800">{s.closing} {s.unit}</T>
              </Row>
              <T muted size={12}>In {s.stockIn} · Out {s.stockOut} · Returned {s.returned} · Adjusted {s.adjustment}</T>
            </Card>
          ))}
          {!stock.data?.items?.length && <Empty loading={stock.loading} text="No stock recorded yet." />}
        </Section>
      )}

      {tab === 'reorder' && (
        <>
          {(reorder.data?.items || []).map((r) => (
            <ListItem key={r.productId} icon="alert-circle-outline" title={r.name} subtitle={`Closing ${r.closing} · reorder level ${r.reorderLevel} · sells ~${r.avgDailySales}/day`} right={<T weight="700">+{r.suggestedQty}</T>} />
          ))}
          {reorder.data?.items?.length > 0 ? (
            <Button title="Order suggested quantities" onPress={() => router.push({ pathname: '/partner/order-new', params: { prefill: JSON.stringify(Object.fromEntries(reorder.data.items.map((r) => [r.productId, r.suggestedQty]))) } })} />
          ) : (
            <Empty loading={reorder.loading} text="All products are above reorder level." />
          )}
        </>
      )}

      {tab === 'ledger' &&
        (txns.data?.items || []).map((t) => (
          <ListItem key={t._id} title={t.product?.name} subtitle={`${date(t.date)} · ${t.reason || t.reference || ''}`} right={<Badge status={{ in: 'approved', out: 'shipped', return: 'pending', adjustment: 'rejected' }[t.type]} text={`${label(t.type)} ${t.delta > 0 ? '+' : ''}${t.delta}`} />} />
        ))}
    </Screen>
  );
}
