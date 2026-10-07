import { useState } from 'react';
import { Button, Card, DataTable, Field, PageHeader, useAction } from '../components/ui.jsx';
import { api } from '../lib/api';
import { dt, label } from '../lib/format';
import { useApi } from '../lib/hooks';

const ROLES = ['field_executive', 'staff', 'manager', 'admin', 'distributor', 'super_distributor', 'stockist'];

export default function Notifications() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('announcement');
  const [userType, setUserType] = useState('');
  const [roles, setRoles] = useState([]);
  const [territory, setTerritory] = useState('');
  const territories = useApi('/admin/territories');
  const log = useApi('/admin/audit-logs?limit=50');
  const [run, busy] = useAction();

  const send = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await api.post('/admin/broadcast', { title, body, type, audience: { userType: userType || undefined, roles: roles.length ? roles : undefined, territory: territory || undefined } });
      setTitle('');
      setBody('');
      log.reload();
      return r;
    }).then((r) => r && alert(`Sent to ${r.recipients} user(s)`)).catch(() => {});
  };

  return (
    <>
      <PageHeader title="Broadcast notifications" subtitle="Push announcements, targets and reminders to employees and partners" />
      <div className="grid grid-2">
        <Card title="New broadcast">
          <form className="stack" onSubmit={send}>
            <Field label="Title *"><input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} /></Field>
            <Field label="Message *"><textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} required maxLength={500} /></Field>
            <div className="form-grid">
              <Field label="Type">
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  {['announcement', 'target', 'attendance', 'salary', 'system'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
                </select>
              </Field>
              <Field label="Audience">
                <select value={userType} onChange={(e) => setUserType(e.target.value)}>
                  <option value="">Everyone</option>
                  <option value="employee">Employees only</option>
                  <option value="partner">Channel partners only</option>
                </select>
              </Field>
              <Field label="Territory">
                <select value={territory} onChange={(e) => setTerritory(e.target.value)}>
                  <option value="">All territories</option>
                  {(territories.data?.items || []).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Roles (optional)">
              <div className="row gap-s wrap">
                {ROLES.map((r) => (
                  <label key={r} className="row gap-s">
                    <input type="checkbox" checked={roles.includes(r)} onChange={(e) => setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))} />
                    {label(r)}
                  </label>
                ))}
              </div>
            </Field>
            <div><Button disabled={busy}>{busy ? 'Sending…' : 'Send notification'}</Button></div>
          </form>
        </Card>
        <Card title="Recent admin activity">
          <DataTable
            rows={log.data?.items}
            loading={log.loading}
            columns={[
              { key: 'createdAt', header: 'When', render: (a) => dt(a.createdAt) },
              { key: 'actor', header: 'By', render: (a) => a.actor?.name },
              { key: 'action', header: 'Action', render: (a) => <span className="mono">{a.action}</span> },
              { key: 'meta', header: 'Details', render: (a) => (a.action === 'broadcast' ? `${a.meta?.title} → ${a.meta?.recipients} users` : a.meta?.reason || '') },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
