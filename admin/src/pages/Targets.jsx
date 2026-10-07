import { useState } from 'react';
import { Badge, Button, Card, DataTable, EditModal, PageHeader } from '../components/ui.jsx';
import { api } from '../lib/api';
import { inr, thisMonth } from '../lib/format';
import { useApi } from '../lib/hooks';

const pctBadge = (p) => (p == null ? <span className="muted">No target</span> : <Badge status={p >= 100 ? 'approved' : p >= 60 ? 'pending' : 'rejected'}>{p}%</Badge>);

export default function Targets() {
  const [period, setPeriod] = useState(thisMonth());
  const [editing, setEditing] = useState(null);
  const perf = useApi(`/team/performance?period=${period}`);

  const quarter = `${period.slice(0, 4)}-Q${Math.ceil(Number(period.slice(5, 7)) / 3)}`;

  return (
    <>
      <PageHeader title="Targets & Performance" subtitle="Set monthly / quarterly targets and track achievement and the performance score">
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 'auto' }} />
      </PageHeader>
      <Card>
        <DataTable
          loading={perf.loading}
          error={perf.error}
          rows={perf.data?.items}
          empty="No employees in your scope."
          columns={[
            { key: 'name', header: 'Employee', render: (r) => <><strong>{r.user.name}</strong><div className="muted">{r.user.employeeCode}</div></> },
            { key: 'sales', header: 'Sales vs target', render: (r) => <>{inr(r.sales.achieved)} / {inr(r.sales.target)} {pctBadge(r.sales.percent)}</> },
            { key: 'visits', header: 'Visits', render: (r) => <>{r.visits.count} / {r.visits.target ?? '-'} {pctBadge(r.visits.percent)}</> },
            { key: 'att', header: 'Attendance', align: 'right', render: (r) => `${r.attendance.present}/${r.attendance.workingDays} (${r.attendance.percent}%)` },
            { key: 'km', header: 'Km', align: 'right', render: (r) => r.distanceKm },
            { key: 'reports', header: 'Reports', align: 'right', render: (r) => `${r.reports.approved}/${r.reports.submitted}${r.reports.avgRating ? ` · ★${r.reports.avgRating}` : ''}` },
            { key: 'score', header: 'Score', align: 'right', render: (r) => <strong>{r.score}</strong> },
            { key: 'x', header: '', align: 'right', render: (r) => <Button size="s" variant="ghost" onClick={() => setEditing({ user: r.user._id, name: r.user.name, periodType: 'month', period, salesAmount: r.sales.target, visits: r.visits.target })}>Set target</Button> },
          ]}
        />
        <p className="muted" style={{ marginBottom: 0 }}>Score = 40% sales + 25% visits + 20% attendance + 15% daily reporting (each capped at 100%).</p>
      </Card>
      <EditModal
        open={Boolean(editing)}
        title={`Target for ${editing?.name}`}
        initial={editing}
        onClose={() => setEditing(null)}
        fields={[
          { name: 'periodType', label: 'Period type', type: 'select', required: true, options: ['month', 'quarter'] },
          { name: 'period', label: 'Period', required: true, hint: `Month: ${period} · Quarter: ${quarter}` },
          { name: 'salesAmount', label: 'Sales target (₹)', type: 'number', required: true },
          { name: 'visits', label: 'Visits target', type: 'number' },
          { name: 'newRetailers', label: 'New retailers target', type: 'number' },
        ]}
        onSubmit={async ({ name, ...v }) => {
          await api.put('/targets', v);
          perf.reload();
        }}
      />
    </>
  );
}
