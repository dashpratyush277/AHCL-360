import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Card, ErrorBox, PageHeader, Spinner, Stat } from '../components/ui.jsx';
import { inr, inrCompact, label } from '../lib/format';
import { useApi } from '../lib/hooks';

const axis = { stroke: 'var(--muted)', fontSize: 12, tickLine: false, axisLine: false };
const grid = <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />;
const tooltipStyle = { contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }, cursor: { fill: 'var(--surface-2)' } };
const monthLabel = (m) => new Date(`${m}-01`).toLocaleDateString('en-IN', { month: 'short' });

function SeriesChart({ data, kind = 'bar', money, color = 'var(--chart-1)', name }) {
  const fmt = money ? inrCompact : (v) => v;
  return (
    <div className="chart-box">
      <ResponsiveContainer>
        {kind === 'line' ? (
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {grid}
            <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
            <YAxis tickFormatter={fmt} width={64} {...axis} />
            <Tooltip {...tooltipStyle} cursor={{ stroke: 'var(--muted)' }} labelFormatter={monthLabel} formatter={(v) => [money ? inr(v) : v, name]} />
            <Line dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: 'var(--surface)' }} activeDot={{ r: 5 }} />
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {grid}
            <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
            <YAxis tickFormatter={fmt} width={64} {...axis} />
            <Tooltip {...tooltipStyle} labelFormatter={monthLabel} formatter={(v) => [money ? inr(v) : v, name]} />
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function HBar({ data, dataKey, nameKey, money, name }) {
  return (
    <div style={{ height: Math.max(160, data.length * 34) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <XAxis type="number" tickFormatter={money ? inrCompact : undefined} {...axis} />
          <YAxis type="category" dataKey={nameKey} width={150} tickFormatter={label} {...axis} />
          <Tooltip {...tooltipStyle} formatter={(v) => [money ? inr(v) : v, name]} labelFormatter={label} />
          <Bar dataKey={dataKey} fill="var(--chart-1)" radius={[0, 4, 4, 0]} barSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Integrations() {
  const { data: s, error } = useApi('/admin/system-status');
  if (error || !s) return null; // managers don't have access
  const row = (name, ok, detail) => (
    <tr key={name}>
      <td>{name}</td>
      <td><Badge status={ok ? 'approved' : 'pending'}>{ok ? 'Live' : 'Not configured'}</Badge></td>
      <td className="muted">{detail}</td>
    </tr>
  );
  return (
    <Card title="Integrations" className="integrations">
      <table className="table">
        <tbody>
          {row('SMS OTP', s.sms.provider !== 'console' && !s.sms.problems.length, s.sms.problems.length ? s.sms.problems.join('; ') : `Provider: ${s.sms.provider}${s.sms.devOtpShownOnScreen ? ' · dev OTP shown on screen' : ''}`)}
          {row('Push notifications (FCM)', s.push.enabled, s.push.enabled ? `${s.push.devices} device(s) registered by ${s.push.usersWithDevices} user(s)` : s.push.error || 'Set FIREBASE_SERVICE_ACCOUNT on the server')}
          {row('Email OTP', s.email.configured, s.email.configured ? 'SMTP configured' : 'Optional – set SMTP_HOST')}
          {row('Database', !s.database.inMemory, s.database.inMemory ? 'Temporary in-memory database – data resets on restart' : 'Persistent MongoDB')}
        </tbody>
      </table>
    </Card>
  );
}

export default function Dashboard() {
  const { data: d, error } = useApi('/analytics/dashboard');
  const { data: c } = useApi('/analytics/charts?months=6');

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Company-wide snapshot for today and the last six months" />
      <ErrorBox error={error} />
      {!d ? (
        <Spinner />
      ) : (
        <div className="grid grid-stats" style={{ marginBottom: 16 }}>
          <Stat label="Employees present today" value={`${d.presentToday} / ${d.teamSize}`} />
          <Stat label="Visits today" value={d.visitsToday} />
          <Stat label="DSO sales this month" value={inrCompact(d.salesThisMonth)} />
          <Stat label="Pending leaves" value={d.pendingLeaves} tone={d.pendingLeaves ? 'warn' : undefined} />
          <Stat label="Pending expenses" value={d.pendingExpenses} tone={d.pendingExpenses ? 'warn' : undefined} />
          {c?.totals && <Stat label="Active distributors" value={c.totals.distributors} hint={`${c.totals.retailers} retailers`} />}
        </div>
      )}
      {c && (
        <div className="grid grid-2">
          <Card title="Partner order value by month">
            <SeriesChart data={c.orderValueByMonth} money name="Order value" />
          </Card>
          <Card title="Field sales (DSO) by month">
            <SeriesChart data={c.salesByMonth} money name="DSO sales" />
          </Card>
          <Card title="Client visits by month">
            <SeriesChart data={c.visitsByMonth} kind="line" name="Visits" />
          </Card>
          <Card title="Orders by status (6 months)">
            {c.ordersByStatus.length ? <HBar data={c.ordersByStatus} dataKey="value" nameKey="status" name="Orders" /> : <p className="muted">No orders yet.</p>}
          </Card>
          {c.topDistributors?.length > 0 && (
            <Card title="Top distributors by order value">
              <HBar data={c.topDistributors} dataKey="value" nameKey="name" money name="Order value" />
            </Card>
          )}
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <Integrations />
      </div>
    </>
  );
}
