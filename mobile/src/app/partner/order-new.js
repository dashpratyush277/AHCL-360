import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import ProductPicker from '../../components/ProductPicker';
import { Button, Card, Input, KV, Screen, T, useBusy } from '../../components/ui';
import { api } from '../../lib/api';
import { inr } from '../../lib/format';

/** Dynamic catalog -> cart -> server-priced summary (unit, price, discount, GST, total) -> place order. */
export default function OrderNew() {
  const { prefill } = useLocalSearchParams();
  const [cart, setCart] = useState(() => {
    try {
      return prefill ? JSON.parse(prefill) : {};
    } catch {
      return {};
    }
  });
  const [quote, setQuote] = useState(null);
  const [notes, setNotes] = useState('');
  const [run, busy] = useBusy();
  const items = Object.entries(cart).filter(([, q]) => q > 0).map(([product, qty]) => ({ product, qty }));
  const key = JSON.stringify(items);

  useEffect(() => {
    if (!items.length) return;
    const t = setTimeout(() => api.post('/orders/quote', { items }).then(setQuote).catch(() => setQuote(null)), 300);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = items.length ? quote : null;

  const place = () =>
    run(async () => {
      const order = await api.post('/orders', { items, notes: notes || undefined });
      Alert.alert('Order placed', `${order.orderNo} · ${inr(order.grandTotal)}`);
      router.replace(`/partner/order/${order._id}`);
    });

  return (
    <Screen>
      <ProductPicker cart={cart} onChange={setCart} />
      <Card title="Order summary">
        {summary ? (
          <>
            {summary.items.map((i) => (
              <KV key={i.product} k={`${i.name} × ${i.qty} ${i.unit}`} v={inr(i.lineTotal)} />
            ))}
            <KV k="Subtotal" v={inr(summary.subtotal)} />
            <KV k="Discount" v={`− ${inr(summary.discountTotal)}`} />
            <KV k="GST" v={inr(summary.taxTotal)} />
            <KV k="Total" v={inr(summary.grandTotal)} />
          </>
        ) : (
          <T muted>Add products to see pricing.</T>
        )}
        <Input label="Notes for dispatch" value={notes} onChangeText={setNotes} />
        <Button title="Place order" loading={busy} disabled={!items.length} onPress={place} />
      </Card>
    </Screen>
  );
}
