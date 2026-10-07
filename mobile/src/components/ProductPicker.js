import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { qs } from '../lib/api';
import { inr } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useTheme } from '../theme';
import { Chips, Empty, Input, T } from './ui';

/**
 * Catalog with search, category filter and +/- quantity steppers.
 * cart: { [productId]: qty } ; onChange(cart, productsById)
 */
export default function ProductPicker({ cart, onChange }) {
  const t = useTheme();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const { data, loading } = useApi(`/products${qs({ q, category, limit: 200 })}`);
  const items = data?.items || [];
  const byId = Object.fromEntries(items.map((p) => [p._id, p]));
  const set = (id, qty) => {
    const next = { ...cart };
    if (qty > 0) next[id] = qty;
    else delete next[id];
    onChange(next, byId);
  };

  return (
    <View style={{ gap: 10 }}>
      <Input placeholder="Search products…" value={q} onChangeText={setQ} />
      {data?.categories?.length > 0 && <Chips options={[['', 'All'], ...data.categories.filter(Boolean).map((c) => [c, c])]} value={category} onChange={setCategory} />}
      {items.map((p) => {
        const qty = cart[p._id] || 0;
        return (
          <View key={p._id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: qty ? t.brand : t.border, backgroundColor: t.surface }}>
            <View style={{ flex: 1 }}>
              <T weight="700">{p.name}</T>
              <T muted size={12}>{p.sku} · {inr(p.price)}/{p.unit} + {p.gstRate}% GST</T>
            </View>
            <Stepper value={qty} onChange={(v) => set(p._id, v)} />
          </View>
        );
      })}
      {!items.length && <Empty loading={loading} text="No products found." />}
    </View>
  );
}

function Stepper({ value, onChange }) {
  const t = useTheme();
  const btn = (txt, fn, label) => (
    <Pressable accessibilityLabel={label} onPress={fn} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
      <T size={18} weight="700">{txt}</T>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {value > 0 && btn('−', () => onChange(value - 1), 'Decrease')}
      {value > 0 && <T weight="700" style={{ minWidth: 26, textAlign: 'center' }}>{value}</T>}
      {btn('+', () => onChange(value + 1), 'Increase')}
    </View>
  );
}
