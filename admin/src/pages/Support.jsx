import { useState } from 'react';
import { Badge, Button, Card, DataTable, Modal, PageHeader, useAction } from '../components/ui.jsx';
import { api, qs } from '../lib/api';
import { dt, label } from '../lib/format';
import { useApi } from '../lib/hooks';

export default function Support() {
  const [status, setStatus] = useState('open');
  const [open, setOpen] = useState(null);
  const list = useApi(`/support/tickets${qs({ all: 1, status })}`);
  return (
    <>
      <PageHeader title="Support tickets" subtitle="In-app support requests from employees and partners" />
      <Card>
        <div className="filters">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {['open', 'in_progress', 'resolved', 'closed'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </div>
        <DataTable
          rows={list.data?.items}
          loading={list.loading}
          onRowClick={(t) => setOpen(t._id)}
          columns={[
            { key: 'ticketNo', header: 'Ticket', render: (t) => <span className="mono">{t.ticketNo}</span> },
            { key: 'subject', header: 'Subject' },
            { key: 'user', header: 'Raised by', render: (t) => `${t.user?.name} (${t.user?.userType})` },
            { key: 'category', header: 'Category', render: (t) => label(t.category) },
            { key: 'priority', header: 'Priority', render: (t) => <Badge status={{ high: 'rejected', medium: 'pending', low: 'closed' }[t.priority]}>{label(t.priority)}</Badge> },
            { key: 'updatedAt', header: 'Updated', render: (t) => dt(t.updatedAt) },
            { key: 'status', header: 'Status', render: (t) => <Badge status={t.status} /> },
          ]}
        />
      </Card>
      {open && <TicketThread id={open} onClose={() => { setOpen(null); list.reload(); }} />}
    </>
  );
}

function TicketThread({ id, onClose }) {
  const { data: t, setData } = useApi(`/support/tickets/${id}`);
  const [text, setText] = useState('');
  const [run, busy] = useAction();
  if (!t) return null;
  return (
    <Modal open wide title={`${t.ticketNo} · ${t.subject}`} onClose={onClose}>
      <div className="stack">
        {t.messages.map((m, i) => (
          <div key={i} className="card" style={{ padding: 12 }}>
            <div className="muted" style={{ fontSize: 12 }}>{m.from?.name} · {dt(m.at)}</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
          </div>
        ))}
        <textarea rows={3} placeholder="Write a reply…" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="modal-foot">
        <select value={t.status} style={{ width: 'auto' }} onChange={(e) => run(() => api.post(`/support/tickets/${id}/status`, { status: e.target.value }), 'Status updated').then(setData).catch(() => {})}>
          {['open', 'in_progress', 'resolved', 'closed'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <Button
          disabled={busy || !text.trim()}
          onClick={() => run(() => api.post(`/support/tickets/${id}/messages`, { text }), 'Reply sent').then(() => { setText(''); return api.get(`/support/tickets/${id}`); }).then(setData).catch(() => {})}
        >
          Send reply
        </Button>
      </div>
    </Modal>
  );
}
