import { router, useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';
import { Badge, Button, Card, Empty, KV, ListItem, Row, Screen, Section, T } from '../../../components/ui';
import { date, label } from '../../../lib/format';
import { useApi } from '../../../lib/hooks';

/** Distributor-wise stock: In / Out / Return / Closing, plus ledger and reorder alerts. */
export default function DistributorDetail() {
  const { id } = useLocalSearchParams();
  const d = useApi(`/distributors/${id}`);
  const stock = useApi(`/stock?distributor=${id}`);
  const txns = useApi(`/stock/txns?distributor=${id}&limit=15&from=2000-01-01`);
  const reorder = useApi(`/stock/reorder-suggestions?distributor=${id}`);
  const dist = d.data;

  const entry = (type) => router.push({ pathname: '/employee/stock-entry', params: { distributor: id, type, name: dist?.name } });

  return (
    <Screen onRefresh={() => Promise.all([stock.reload(), txns.reload(), reorder.reload()])} refreshing={stock.loading}>
      {dist && (
        <Card title={dist.name} right={<Badge status="approved" text={label(dist.tier)} />}>
          <KV k="Code" v={dist.code} />
          <KV k="GSTIN" v={dist.gstin || '-'} />
          <KV k="Contact" v={`${dist.contact?.person || ''} ${dist.contact?.mobile || ''}`} />
          <Row>
            {dist.contact?.mobile && <Button small variant="ghost" icon="call-outline" title="Call" onPress={() => Linking.openURL(`tel:${dist.contact.mobile}`)} />}
            {dist.location?.lat && <Button small variant="ghost" icon="navigate-outline" title="Directions" onPress={() => Linking.openURL(`https://maps.google.com/?daddr=${dist.location.lat},${dist.location.lng}`)} />}
          </Row>
        </Card>
      )}

      <Row style={{ flexWrap: 'wrap' }}>
        <Button small icon="arrow-down" title="Stock in" onPress={() => entry('in')} />
        <Button small icon="arrow-up" title="Stock out" onPress={() => entry('out')} />
        <Button small variant="soft" icon="return-down-back" title="Return" onPress={() => entry('return')} />
        <Button small variant="ghost" icon="receipt-outline" title="DSO" onPress={() => router.push({ pathname: '/employee/dso-new', params: { distributor: id } })} />
      </Row>

      {reorder.data?.items?.length > 0 && (
        <Section title="Reorder suggestions">
          {reorder.data.items.map((r) => (
            <ListItem key={r.productId} icon="alert-circle-outline" title={r.name} subtitle={`Closing ${r.closing} · reorder level ${r.reorderLevel}`} right={<T weight="700">+{r.suggestedQty} {r.unit}</T>} />
          ))}
        </Section>
      )}

      <Section title="Closing stock">
        {(stock.data?.items || []).map((s) => (
          <Card key={s.productId} style={{ padding: 12, gap: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T weight="700" style={{ flex: 1 }}>{s.name}</T>
              <T weight="800">{s.closing} {s.unit}</T>
            </Row>
            <T muted size={12}>In {s.stockIn} · Out {s.stockOut} · Returned {s.returned} · Adj. {s.adjustment}</T>
          </Card>
        ))}
        {!stock.data?.items?.length && <Empty loading={stock.loading} error={stock.error} text="No stock movements recorded." />}
      </Section>

      <Section title="Recent movements">
        {(txns.data?.items || []).map((t) => (
          <ListItem key={t._id} title={`${t.product?.name}`} subtitle={`${date(t.date)} · ${t.reason || t.reference || ''}`} right={<Badge status={{ in: 'approved', out: 'shipped', return: 'pending', adjustment: 'rejected' }[t.type]} text={`${label(t.type)} ${t.delta > 0 ? '+' : ''}${t.delta}`} />} />
        ))}
      </Section>
    </Screen>
  );
}
