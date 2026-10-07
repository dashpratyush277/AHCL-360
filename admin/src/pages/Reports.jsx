import { useState } from 'react';
import { Button, Card, Field, PageHeader, useAction } from '../components/ui.jsx';
import { api, qs } from '../lib/api';
import { today } from '../lib/format';
import { useApi } from '../lib/hooks';

const REPORTS = [
  ['daily-work', 'Daily Work Summary', 'Work reports submitted by employees with visits, km and sales'],
  ['attendance', 'Attendance Report', 'Check-in / check-out times, hours and geofence status'],
  ['visit-route', 'Visit Route Report', 'Every client visit with timings, distance and location validation'],
  ['expense', 'Expense Report', 'All expense claims with totals claimed and approved'],
  ['sales', 'Daily Sales Orders', 'DSO entries by employee, distributor and retailer'],
  ['orders', 'Partner Orders', 'Orders placed by distributors with status and value'],
  ['stock', 'Stock Statement', 'Opening, in, out, returns, adjustments and closing for one distributor'],
];

export default function Reports() {
  const first = today().slice(0, 8) + '01';
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(today());
  const [user, setUser] = useState('');
  const [distributor, setDistributor] = useState('');
  const users = useApi('/admin/users?userType=employee&limit=200');
  const dists = useApi('/distributors?limit=200');
  const [run, busy] = useAction();

  const download = (type, format) => {
    const params = { from, to, format };
    if (['orders', 'stock'].includes(type)) params.distributor = distributor || undefined;
    else if (user) params.user = user;
    else params.team = 1;
    run(() => api.download(`/reports/${type}${qs(params)}`, `${type}.${format}`));
  };

  return (
    <>
      <PageHeader title="Reports" subtitle="Auto-generated PDF and Excel reports" />
      <Card>
        <div className="form-grid" style={{ marginBottom: 16 }}>
          <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Employee (employee reports)">
            <select value={user} onChange={(e) => setUser(e.target.value)}>
              <option value="">Everyone in scope</option>
              {(users.data?.items || []).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Distributor (partner reports)">
            <select value={distributor} onChange={(e) => setDistributor(e.target.value)}>
              <option value="">All / select for stock</option>
              {(dists.data?.items || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-2">
          {REPORTS.map(([type, title, desc]) => (
            <div key={type} className="card row gap" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{title}</strong>
                <div className="muted">{desc}</div>
              </div>
              <div className="row gap-s">
                <Button size="s" variant="ghost" disabled={busy || (type === 'stock' && !distributor)} onClick={() => download(type, 'pdf')}>PDF</Button>
                <Button size="s" variant="ghost" disabled={busy || (type === 'stock' && !distributor)} onClick={() => download(type, 'xlsx')}>Excel</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
