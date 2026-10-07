import { useState } from 'react';
import { Badge, Button, Card, DataTable, EditModal, Field, Modal, PageHeader, Tabs, useAction } from '../components/ui.jsx';
import { api, qs } from '../lib/api';
import { date, inr, label, thisMonth } from '../lib/format';
import { useApi } from '../lib/hooks';

export default function Hr() {
  const [tab, setTab] = useState('holidays');
  return (
    <>
      <PageHeader title="HR & Payroll" subtitle="Holiday calendar, payslips and the employee document vault" />
      <Card>
        <Tabs tabs={[['holidays', 'Holiday calendar'], ['payslips', 'Payslips'], ['documents', 'Document vault']]} value={tab} onChange={setTab} />
        {tab === 'holidays' && <Holidays />}
        {tab === 'payslips' && <Payslips />}
        {tab === 'documents' && <Documents />}
      </Card>
    </>
  );
}

function Holidays() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [adding, setAdding] = useState(false);
  const list = useApi(`/hr/holidays?year=${year}`);
  const [run] = useAction();
  return (
    <>
      <div className="filters">
        <select value={year} onChange={(e) => setYear(e.target.value)}>
          {[0, 1, -1].map((d) => String(new Date().getFullYear() + d)).sort().map((y) => <option key={y}>{y}</option>)}
        </select>
        <Button onClick={() => setAdding(true)}>+ Add holiday</Button>
      </div>
      <DataTable
        rows={list.data?.items}
        loading={list.loading}
        columns={[
          { key: 'date', header: 'Date', render: (h) => date(h.date) },
          { key: 'day', header: 'Day', render: (h) => new Date(h.date).toLocaleDateString('en-IN', { weekday: 'long' }) },
          { key: 'name', header: 'Holiday' },
          { key: 'type', header: 'Type', render: (h) => label(h.type) },
          { key: 'region', header: 'Region', render: (h) => h.region || 'All' },
          { key: 'x', header: '', align: 'right', render: (h) => <Button size="s" variant="ghost" onClick={() => run(() => api.del(`/hr/holidays/${h._id}`), 'Removed').then(list.reload)}>Remove</Button> },
        ]}
      />
      <EditModal
        open={adding}
        title="Add holiday"
        onClose={() => setAdding(false)}
        fields={[
          { name: 'date', label: 'Date', type: 'date', required: true },
          { name: 'name', label: 'Name', required: true },
          { name: 'type', label: 'Type', type: 'select', options: ['national', 'regional', 'optional', 'company'] },
          { name: 'region', label: 'Region (optional)' },
        ]}
        onSubmit={async (v) => { await api.post('/hr/holidays', v); list.reload(); }}
      />
    </>
  );
}

function EmployeePicker({ value, onChange }) {
  const users = useApi('/admin/users?userType=employee&limit=200');
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select employee…</option>
      {(users.data?.items || []).map((u) => <option key={u._id} value={u._id}>{u.name} ({u.employeeCode || u.mobile})</option>)}
    </select>
  );
}

function Payslips() {
  const [user, setUser] = useState('');
  const [open, setOpen] = useState(false);
  const list = useApi(user ? `/hr/payslips?user=${user}` : null);
  const [run] = useAction();
  return (
    <>
      <div className="filters">
        <EmployeePicker value={user} onChange={setUser} />
        <Button disabled={!user} onClick={() => setOpen(true)}>+ Generate payslip</Button>
      </div>
      {user ? (
        <DataTable
          rows={list.data?.items}
          loading={list.loading}
          columns={[
            { key: 'month', header: 'Month' },
            { key: 'gross', header: 'Gross', align: 'right', render: (p) => inr(p.gross) },
            { key: 'net', header: 'Net pay', align: 'right', render: (p) => inr(p.net) },
            { key: 'paidDays', header: 'Paid days', align: 'right' },
            { key: 'creditedAt', header: 'Credited', render: (p) => (p.creditedAt ? <Badge status="paid">{date(p.creditedAt)}</Badge> : <Badge status="pending" />) },
            { key: 'x', header: '', align: 'right', render: (p) => <Button size="s" variant="ghost" onClick={() => run(() => api.download(`/hr/payslips/${p.month}/pdf?user=${user}`))}>PDF</Button> },
          ]}
        />
      ) : (
        <p className="muted">Select an employee to view or generate payslips.</p>
      )}
      {open && <PayslipModal user={user} onClose={() => setOpen(false)} onSaved={list.reload} />}
    </>
  );
}

function PayslipModal({ user, onClose, onSaved }) {
  const emp = useApi(`/admin/users/${user}`);
  const s = emp.data?.salary || {};
  const [month, setMonth] = useState(thisMonth());
  const [paidDays, setPaidDays] = useState(30);
  const [credited, setCredited] = useState(true);
  const [run, busy] = useAction();
  const earnings = [{ label: 'Basic', amount: s.basic || 0 }, { label: 'HRA', amount: s.hra || 0 }, { label: 'Allowances', amount: s.allowances || 0 }];
  const deductions = [{ label: 'PF', amount: s.deductions || 0 }, { label: 'Professional Tax', amount: 200 }];
  const factor = paidDays / 30;
  const scale = (arr) => arr.map((x) => ({ ...x, amount: Math.round(x.amount * factor) }));
  const gross = scale(earnings).reduce((a, x) => a + x.amount, 0);
  const net = gross - deductions.reduce((a, x) => a + x.amount, 0);
  return (
    <Modal open title="Generate payslip" onClose={onClose}>
      <div className="form-grid">
        <Field label="Month"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
        <Field label="Paid days (of 30)"><input type="number" value={paidDays} min={0} max={31} onChange={(e) => setPaidDays(Number(e.target.value))} /></Field>
        <Field label="Mark as credited (notifies employee)"><input type="checkbox" checked={credited} onChange={(e) => setCredited(e.target.checked)} /></Field>
      </div>
      <p className="muted">Based on the salary structure on the employee's profile. Gross {inr(gross)} · Net {inr(net)}</p>
      <div className="modal-foot">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          disabled={busy || !s.basic}
          onClick={() =>
            run(() => api.post('/hr/payslips', { user, month, paidDays, earnings: scale(earnings), deductions, creditedAt: credited ? new Date().toISOString() : undefined }), 'Payslip saved')
              .then(() => { onSaved(); onClose(); })
              .catch(() => {})
          }
        >
          Save payslip
        </Button>
      </div>
      {!s.basic && emp.data && <div className="error-box">Set a salary structure on this employee's profile first.</div>}
    </Modal>
  );
}

function Documents() {
  const [user, setUser] = useState('');
  const list = useApi(user ? `/hr/documents${qs({ user })}` : null);
  const [category, setCategory] = useState('offer_letter');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [run, busy] = useAction();

  const issue = async (e) => {
    e.preventDefault();
    await run(async () => {
      const { files } = await api.upload([file], 'document');
      await api.post('/hr/documents', { user, category, title, file: files[0].id });
    }, 'Document issued');
    setTitle('');
    setFile(null);
    list.reload();
  };

  return (
    <>
      <div className="filters">
        <EmployeePicker value={user} onChange={setUser} />
      </div>
      {user && (
        <form className="filters" onSubmit={(e) => issue(e).catch(() => {})}>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {['offer_letter', 'appointment_letter', 'policy', 'id_proof', 'other'].map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
          <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files[0])} required />
          <Button disabled={busy || !file}>Issue document</Button>
        </form>
      )}
      {user ? (
        <DataTable
          rows={list.data?.items}
          loading={list.loading}
          columns={[
            { key: 'title', header: 'Title' },
            { key: 'category', header: 'Category', render: (d) => label(d.category) },
            { key: 'src', header: 'Source', render: (d) => (d.issuedByCompany ? 'Issued by HR' : 'Uploaded by employee') },
            { key: 'createdAt', header: 'Date', render: (d) => date(d.createdAt) },
            { key: 'status', header: 'Status', render: (d) => <Badge status={d.status} /> },
            {
              key: 'x',
              header: '',
              align: 'right',
              render: (d) => (
                <div className="row gap-s" style={{ justifyContent: 'flex-end' }}>
                  <Button size="s" variant="ghost" onClick={() => run(() => api.open(`/files/${d.file?._id || d.file}`))}>View</Button>
                  {d.status === 'pending' && <Button size="s" onClick={() => run(() => api.post(`/hr/documents/${d._id}/verify`, { status: 'verified' }), 'Verified').then(list.reload)}>Verify</Button>}
                  {d.status === 'pending' && <Button size="s" variant="danger" onClick={() => run(() => api.post(`/hr/documents/${d._id}/verify`, { status: 'rejected' }), 'Rejected').then(list.reload)}>Reject</Button>}
                </div>
              ),
            },
          ]}
        />
      ) : (
        <p className="muted">Select an employee to see their vault and KYC uploads.</p>
      )}
    </>
  );
}
