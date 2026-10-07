import { useMemo, useState } from 'react';
import { Badge, Button, Card, DataTable, EditModal, PageHeader, Tabs, useAction } from '../components/ui.jsx';
import { api, qs } from '../lib/api';
import { date, label } from '../lib/format';
import { useApi, useDebounced } from '../lib/hooks';

const EMPLOYEE_ROLES = ['field_executive', 'staff', 'manager', 'admin', 'super_admin'];
const PARTNER_ROLES = ['distributor', 'super_distributor', 'stockist'];

export default function Users() {
  const [type, setType] = useState('employee');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const query = useDebounced(q);
  const list = useApi(`/admin/users${qs({ userType: type, q: query, page, limit: 25 })}`);
  const managers = useApi('/admin/users?userType=employee&limit=200');
  const territories = useApi('/admin/territories');
  const distributors = useApi('/distributors?limit=200');
  const [run] = useAction();

  const fields = useMemo(() => {
    const base = [
      { name: 'name', label: 'Full name', required: true },
      { name: 'mobile', label: 'Mobile', required: true, placeholder: '10-digit mobile' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'password', label: editing?._id ? 'Reset password' : 'Password', type: 'password', hint: 'Optional if the user logs in with OTP. Min 8 characters.' },
      { name: 'role', label: 'Role', type: 'select', required: true, options: type === 'employee' ? EMPLOYEE_ROLES : PARTNER_ROLES },
    ];
    if (type === 'partner') {
      return [...base, { name: 'distributor', label: 'Linked distributor', type: 'select', required: true, options: (distributors.data?.items || []).map((d) => [d._id, `${d.name} (${d.code})`]) }];
    }
    return [
      ...base,
      { name: 'employeeCode', label: 'Employee code' },
      { name: 'manager', label: 'Reports to', type: 'select', options: (managers.data?.items || []).filter((m) => m._id !== editing?._id).map((m) => [m._id, `${m.name} (${label(m.role)})`]) },
      { name: 'territory', label: 'Territory', type: 'select', options: (territories.data?.items || []).map((t) => [t._id, t.name]) },
      { name: 'profile.designation', label: 'Designation' },
      { name: 'profile.department', label: 'Department' },
      { name: 'profile.dateOfJoining', label: 'Date of joining', type: 'date' },
      { name: 'officeHours.start', label: 'Office start (HH:mm)', placeholder: '09:30' },
      { name: 'officeHours.end', label: 'Office end (HH:mm)', placeholder: '18:30' },
      { name: 'travelMode', label: 'Travel mode', type: 'select', options: ['bike', 'car', 'public'] },
      { name: 'salary.basic', label: 'Basic salary (₹)', type: 'number' },
      { name: 'salary.hra', label: 'HRA (₹)', type: 'number' },
      { name: 'salary.allowances', label: 'Allowances (₹)', type: 'number' },
      { name: 'salary.deductions', label: 'PF / deductions (₹)', type: 'number' },
    ];
  }, [type, editing, managers.data, territories.data, distributors.data]);

  const toForm = (u) => ({
    ...u,
    manager: u.manager?._id || u.manager,
    territory: u.territory?._id || u.territory,
    distributor: u.distributor?._id || u.distributor,
    profile: { ...u.profile, dateOfJoining: u.profile?.dateOfJoining?.slice(0, 10) },
  });

  const save = async (v) => {
    const { _id, createdAt, updatedAt, kyc, bank, lastLoginAt, isBlocked, blockedReason, __v, id, ...body } = v;
    if (editing?._id) {
      delete body.userType;
      await api.patch(`/admin/users/${editing._id}`, body);
    } else await api.post('/admin/users', { ...body, userType: type });
    list.reload();
  };

  const toggleBlock = (u) => {
    const reason = u.isBlocked ? undefined : window.prompt(`Block ${u.name}? Enter a reason:`);
    if (!u.isBlocked && reason === null) return;
    run(() => api.post(`/admin/users/${u._id}/block`, { blocked: !u.isBlocked, reason: reason || undefined }), u.isBlocked ? 'User reactivated' : 'User blocked').then(list.reload);
  };

  const columns = [
    { key: 'name', header: 'Name', render: (u) => <><strong>{u.name}</strong><div className="muted">{u.employeeCode || u.email || ''}</div></> },
    { key: 'mobile', header: 'Mobile' },
    { key: 'role', header: 'Role', render: (u) => label(u.role) },
    type === 'employee'
      ? { key: 'manager', header: 'Reports to', render: (u) => u.manager?.name || '-' }
      : { key: 'distributor', header: 'Distributor', render: (u) => (u.distributor ? `${u.distributor.name} (${u.distributor.code})` : '-') },
    { key: 'kyc', header: 'KYC', render: (u) => <Badge status={u.kyc?.status === 'not_submitted' ? 'closed' : u.kyc?.status}>{label(u.kyc?.status)}</Badge> },
    { key: 'status', header: 'Status', render: (u) => <Badge status={u.isBlocked ? 'blocked' : 'active'} /> },
    { key: 'lastLoginAt', header: 'Last login', render: (u) => date(u.lastLoginAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) => (
        <div className="row gap-s" style={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
          {u.kyc?.status === 'pending' && (
            <Button size="s" variant="ghost" onClick={() => run(() => api.post(`/hr/kyc/${u._id}/review`, { status: 'verified' }), 'KYC verified').then(list.reload)}>Verify KYC</Button>
          )}
          <Button size="s" variant="ghost" onClick={() => run(() => api.post(`/admin/users/${u._id}/force-logout`), 'Sessions revoked')}>Force logout</Button>
          <Button size="s" variant={u.isBlocked ? 'ghost' : 'danger'} onClick={() => toggleBlock(u)}>{u.isBlocked ? 'Reactivate' : 'Block'}</Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Employees & Users" subtitle="Onboard employees and partner logins, assign roles, block or reactivate access">
        <Button onClick={() => setEditing({ officeHours: { start: '09:30', end: '18:30' } })}>+ Add {type === 'employee' ? 'employee' : 'partner user'}</Button>
      </PageHeader>
      <Card>
        <Tabs tabs={[['employee', 'Employees'], ['partner', 'Channel partners']]} value={type} onChange={(t) => { setType(t); setPage(1); }} />
        <div className="filters">
          <input placeholder="Search name, mobile, code…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} page={page} total={list.data?.total} limit={25} onPage={setPage} onRowClick={(u) => setEditing(toForm(u))} />
      </Card>
      <EditModal open={Boolean(editing)} wide title={editing?._id ? `Edit ${editing.name}` : 'New user'} fields={fields} initial={editing} onClose={() => setEditing(null)} onSubmit={save} />
    </>
  );
}
