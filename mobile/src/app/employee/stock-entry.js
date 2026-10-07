import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Button, Card, Chips, Input, ListItem, Screen, T, useBusy } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { label } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { submitOrQueue } from '../../lib/offline';

const RETURN_REASONS = ['Damaged', 'Expired', 'Leakage', 'Wrong item', 'Excess stock'];

/** Shared by employee and partner panels: stock in / out / return / adjustment. */
export default function StockEntry() {
  const params = useLocalSearchParams();
  const [type, setType] = useState(params.type || 'in');
  const [product, setProduct] = useState(null);
  const [q, setQ] = useState('');
  const [qty, setQty] = useState('');
  const [direction, setDirection] = useState('minus');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const products = useApi(product ? null : `/products${qs({ q, limit: 10 })}`);
  const [run, busy] = useBusy();
  const needsReason = type === 'return' || type === 'adjustment';

  const submit = () =>
    run(async () => {
      const n = Number(qty);
      const payload = {
        distributor: params.distributor,
        product: product._id,
        type,
        ...(type === 'adjustment' ? { delta: direction === 'minus' ? -n : n } : { qty: n }),
        reason: reason || undefined,
        reference: reference || undefined,
        date: new Date().toISOString(),
      };
      const r = await submitOrQueue('stock.txn', payload, (p) => api.post('/stock/txns', p));
      Alert.alert(r.queued ? 'Saved offline' : 'Stock updated', r.queued ? 'It will sync when you are online.' : `${label(type)} of ${n} ${product.unit} recorded.`);
      router.back();
    });

  return (
    <Screen>
      <Card>
        {params.name ? <T weight="700">{params.name}</T> : null}
        <Chips label="Entry type" options={[['in', 'Stock in'], ['out', 'Stock out'], ['return', 'Return goods'], ['adjustment', 'Adjustment']]} value={type} onChange={setType} />
        {!product ? (
          <>
            <Input label="Product" placeholder="Search product…" value={q} onChangeText={setQ} />
            {(products.data?.items || []).map((p) => <ListItem key={p._id} title={p.name} subtitle={`${p.sku} · ${p.unit}`} onPress={() => setProduct(p)} />)}
          </>
        ) : (
          <ListItem icon="cube" title={product.name} subtitle="Tap to change" onPress={() => setProduct(null)} />
        )}
        {type === 'adjustment' && <Chips label="Direction" options={[['minus', 'Reduce (damaged / lost)'], ['plus', 'Increase (found)']]} value={direction} onChange={setDirection} />}
        <Input label={`Quantity${product ? ` (${product.unit})` : ''}`} value={qty} onChangeText={(v) => setQty(v.replace(/[^\d]/g, ''))} keyboardType="number-pad" />
        {needsReason && <Chips label="Reason" options={RETURN_REASONS.map((r) => [r, r])} value={reason} onChange={setReason} />}
        {needsReason && <Input placeholder="Or type a reason" value={reason} onChangeText={setReason} />}
        {type === 'in' && <Input label="Invoice / reference no." value={reference} onChangeText={setReference} />}
        <Button title="Save entry" loading={busy} disabled={!product || !Number(qty) || (needsReason && !reason)} onPress={submit} />
      </Card>
    </Screen>
  );
}
