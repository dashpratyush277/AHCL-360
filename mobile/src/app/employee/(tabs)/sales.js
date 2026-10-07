import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Chips, Empty, KV, ListItem, Screen, Section, T } from '../../../components/ui';
import { date, inr, label } from '../../../lib/format';
import { useApi } from '../../../lib/hooks';
import { useTheme } from '../../../theme';

export default function Sales() {
  const [tab, setTab] = useState('distributors');
  const dists = useApi('/distributors?limit=100');
  const targets = useApi('/targets');
  const dso = useApi('/dso?limit=30');

  return (
    <Screen onRefresh={() => Promise.all([dists.reload(), targets.reload(), dso.reload()])} refreshing={dists.loading}>
      <Chips options={[['distributors', 'Distributors'], ['dso', 'Sales orders'], ['targets', 'Targets']]} value={tab} onChange={setTab} />

      {tab === 'distributors' && (
        <Section title={`Mapped distributors (${dists.data?.total ?? 0})`}>
          {(dists.data?.items || []).map((d) => (
            <ListItem key={d._id} icon="business-outline" title={d.name} subtitle={`${d.code} · ${label(d.tier)}${d.territory ? ` · ${d.territory.name}` : ''}`} onPress={() => router.push(`/employee/distributor/${d._id}`)} />
          ))}
          {!dists.data?.items?.length && <Empty loading={dists.loading} error={dists.error} text="No distributors are mapped to you yet." />}
        </Section>
      )}

      {tab === 'dso' && (
        <>
          <Button title="New daily sales order" icon="add" onPress={() => router.push('/employee/dso-new')} />
          <Section title="Recent orders">
            {(dso.data?.items || []).map((o) => (
              <ListItem key={o._id} icon="receipt-outline" title={o.retailer?.shopName || o.retailer?.name || o.distributor?.name} subtitle={`${date(o.date)} · ${o.items.length} item(s)`} right={<T weight="700">{inr(o.total)}</T>} />
            ))}
            {!dso.data?.items?.length && <Empty loading={dso.loading} text="No sales orders yet this month." />}
          </Section>
        </>
      )}

      {tab === 'targets' &&
        (targets.data?.items || []).map((t) => (
          <Card key={t.period} title={`${t.periodType === 'quarter' ? 'Quarter' : 'Month'} · ${t.period}`}>
            {t.target ? (
              <>
                <Progress label="Sales" achieved={t.achieved.salesAmount} target={t.target.salesAmount} money />
                <Progress label="Visits" achieved={t.achieved.visits} target={t.target.visits} />
                <Progress label="New retailers" achieved={t.achieved.newRetailers} target={t.target.newRetailers} />
              </>
            ) : (
              <>
                <T muted>No target assigned. Achievement so far:</T>
                <KV k="Sales" v={inr(t.achieved.salesAmount)} />
                <KV k="Visits" v={t.achieved.visits} />
              </>
            )}
          </Card>
        ))}
    </Screen>
  );
}

function Progress({ label: l, achieved, target, money }) {
  const pct = target ? Math.min(100, Math.round((achieved / target) * 100)) : 0;
  const fmt = money ? inr : (x) => x;
  return (
    <Card style={{ padding: 10 }}>
      <KV k={l} v={`${fmt(achieved)} / ${fmt(target)}`} />
      <ProgressBar pct={pct} />
      <T muted size={12}>{target ? `${Math.round((achieved / target) * 100)}% achieved` : 'No target'}</T>
    </Card>
  );
}

function ProgressBar({ pct }) {
  const t = useTheme();
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surface2, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: pct >= 100 ? t.ok : t.brand, borderRadius: 4 }} />
    </View>
  );
}
