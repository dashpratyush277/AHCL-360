import { useLocalSearchParams } from 'expo-router';
import { Alert, View } from 'react-native';
import { Badge, Button, Card, Empty, KV, Screen, T, useBusy } from '../../../components/ui';
import { api } from '../../../lib/api';
import { dt, inr, label } from '../../../lib/format';
import { useApi } from '../../../lib/hooks';
import { useTheme } from '../../../theme';

const STEPS = ['processing', 'packed', 'shipped', 'delivered'];

export default function OrderDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams();
  const { data: o, loading, reload } = useApi(`/orders/${id}`);
  const [run, busy] = useBusy();
  if (!o) return <Empty loading={loading} />;
  const stepIdx = STEPS.indexOf(o.status);

  const cancel = () =>
    Alert.alert('Cancel order?', o.orderNo, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel order', style: 'destructive', onPress: () => run(() => api.post(`/orders/${id}/status`, { status: 'cancelled' })).then(reload) },
    ]);

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <Card title={o.orderNo} right={<Badge status={o.status} />}>
        {o.status !== 'cancelled' && (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {STEPS.map((s, i) => (
              <View key={s} style={{ flex: 1, gap: 4 }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: i <= stepIdx ? t.brand : t.surface2 }} />
                <T size={11} muted={i > stepIdx}>{label(s)}</T>
              </View>
            ))}
          </View>
        )}
        <KV k="Placed" v={dt(o.createdAt)} />
        {o.trackingInfo ? <KV k="Tracking" v={o.trackingInfo} /> : null}
        {o.invoice ? <KV k="Invoice" v={o.invoice.invoiceNo} /> : null}
      </Card>
      <Card title="Items">
        {o.items.map((i) => (
          <View key={i._id || i.product} style={{ gap: 2 }}>
            <KV k={i.name} v={inr(i.lineTotal)} />
            <T muted size={12}>{i.qty} {i.unit} × {inr(i.price)}{i.discountPct ? ` − ${i.discountPct}%` : ''} + {i.gstRate}% GST</T>
          </View>
        ))}
        <KV k="Subtotal" v={inr(o.subtotal)} />
        <KV k="Discount" v={inr(o.discountTotal)} />
        <KV k="GST" v={inr(o.taxTotal)} />
        <KV k="Grand total" v={inr(o.grandTotal)} />
      </Card>
      <Card title="Status history">
        {o.statusHistory.map((h, i) => <KV key={i} k={label(h.status)} v={dt(h.at)} />)}
      </Card>
      {o.invoice && <Button title="Download GST invoice (PDF)" icon="download-outline" loading={busy} onPress={() => run(() => api.downloadAndShare(`/invoices/${o.invoice._id}/pdf`, `${o.invoice.invoiceNo}.pdf`))} />}
      {o.status === 'processing' && <Button title="Cancel order" variant="danger" onPress={cancel} />}
    </Screen>
  );
}
