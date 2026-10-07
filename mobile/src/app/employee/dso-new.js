import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import ProductPicker from '../../components/ProductPicker';
import { Button, Card, Chips, Input, KV, ListItem, Screen, T, useBusy } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { inr } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { submitOrQueue } from '../../lib/offline';

/** Daily Sales Order: booking taken by field staff for a distributor or a retailer. */
export default function DsoNew() {
  const params = useLocalSearchParams();
  const [distributor, setDistributor] = useState(params.distributor || '');
  const [retailer, setRetailer] = useState(null);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState({});
  const [products, setProducts] = useState({});
  const [remarks, setRemarks] = useState('');
  const dists = useApi('/distributors?limit=100');
  const rets = useApi(distributor && !retailer ? `/retailers${qs({ distributor, q: search, limit: 8 })}` : null);
  const [run, busy] = useBusy();

  const lines = Object.entries(cart).map(([id, qty]) => ({ product: id, qty, p: products[id] }));
  const total = lines.reduce((a, l) => a + (l.p?.price || 0) * l.qty, 0);

  const submit = () =>
    run(async () => {
      const payload = { distributor, retailer: retailer?._id, items: lines.map(({ product, qty }) => ({ product, qty })), remarks: remarks || undefined };
      const r = await submitOrQueue('dso.create', payload, (p) => api.post('/dso', p));
      Alert.alert(r.queued ? 'Saved offline' : 'Order saved', r.queued ? 'It will sync when you are online.' : `Total ${inr(r.result.total)}`);
      router.back();
    });

  return (
    <Screen>
      <Card>
        <Chips label="Distributor" options={(dists.data?.items || []).map((d) => [d._id, d.name])} value={distributor} onChange={(v) => { setDistributor(v); setRetailer(null); }} />
        {distributor && !retailer && (
          <>
            <Input label="Retailer (optional)" placeholder="Search retailer…" value={search} onChangeText={setSearch} />
            {(rets.data?.items || []).map((r) => <ListItem key={r._id} title={r.shopName || r.name} subtitle={r.city} onPress={() => setRetailer(r)} />)}
          </>
        )}
        {retailer && <ListItem icon="storefront" title={retailer.shopName || retailer.name} subtitle="Tap to remove" onPress={() => setRetailer(null)} />}
      </Card>
      <ProductPicker cart={cart} onChange={(c, byId) => { setCart(c); setProducts((p) => ({ ...p, ...byId })); }} />
      <Card>
        <Input label="Remarks" value={remarks} onChangeText={setRemarks} />
        <KV k={`${lines.length} item(s)`} v={inr(total)} />
        <T muted size={12}>Value at distributor price, excluding GST.</T>
        <Button title="Save sales order" loading={busy} disabled={!distributor || !lines.length} onPress={submit} />
      </Card>
    </Screen>
  );
}
