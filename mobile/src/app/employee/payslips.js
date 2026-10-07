import { Button, Card, Empty, KV, ListItem, Screen, Section, useBusy } from '../../components/ui';
import { api } from '../../lib/api';
import { date, inr } from '../../lib/format';
import { useApi } from '../../lib/hooks';

export default function Payslips() {
  const slips = useApi('/hr/payslips');
  const summary = useApi('/hr/salary-summary');
  const [run, busy] = useBusy();
  const s = summary.data;

  return (
    <Screen onRefresh={() => Promise.all([slips.reload(), summary.reload()])} refreshing={slips.loading}>
      {s && (
        <Card title="Salary summary">
          <KV k="Basic" v={inr(s.structure.basic)} />
          <KV k="HRA" v={inr(s.structure.hra)} />
          <KV k="Allowances" v={inr(s.structure.allowances)} />
          <KV k="Deductions (PF etc.)" v={inr(s.structure.deductions)} />
          <KV k="Gross (last 12 months)" v={inr(s.totals.gross)} />
          <KV k="Net received (last 12 months)" v={inr(s.totals.net)} />
        </Card>
      )}
      <Section title="Payslips">
        {(slips.data?.items || []).map((p) => (
          <ListItem
            key={p._id}
            icon="document-text-outline"
            title={new Date(`${p.month}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            subtitle={`Net ${inr(p.net)} · ${p.creditedAt ? `credited ${date(p.creditedAt)}` : 'not yet credited'}`}
            right={<Button small variant="soft" icon="download-outline" disabled={busy} onPress={() => run(() => api.downloadAndShare(`/hr/payslips/${p.month}/pdf`, `Payslip-${p.month}.pdf`))} />}
          />
        ))}
        {!slips.data?.items?.length && <Empty loading={slips.loading} text="No payslips published yet." />}
      </Section>
    </Screen>
  );
}
