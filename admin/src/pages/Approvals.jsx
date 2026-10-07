import { useState } from 'react';
import { Badge, Button, Card, DataTable, PageHeader, ReviewModal, Tabs, useAction } from '../components/ui.jsx';
import { api, qs } from '../lib/api';
import { date, inr, label } from '../lib/format';
import { useApi } from '../lib/hooks';

const STATUS = {
  leaves: ['pending', 'approved', 'rejected'],
  expenses: ['pending', 'approved', 'reimbursed', 'rejected'],
  claims: ['pending', 'revision_requested', 'approved', 'settled', 'rejected'],
  reports: ['submitted', 'needs_changes', 'approved'],
};

export default function Approvals() {
  const [tab, setTab] = useState('leaves');
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [reviewing, setReviewing] = useState(null);
  const [run] = useAction();

  const path = {
    leaves: `/hr/leaves${qs({ scope: 'team', status, page })}`,
    expenses: `/expenses${qs({ scope: 'team', status, page, from: '2000-01-01' })}`,
    claims: `/claims${qs({ status, page })}`,
    reports: `/team/work-reports${qs({ scope: 'team', status, page })}`,
  }[tab];
  const list = useApi(path);

  const openFile = (id) => run(() => api.open(`/files/${id}`));

  const columns = {
    leaves: [
      { key: 'user', header: 'Employee', render: (r) => r.user?.name },
      { key: 'type', header: 'Type', render: (r) => label(r.type) },
      { key: 'dates', header: 'Dates', render: (r) => `${date(r.from)} – ${date(r.to)}` },
      { key: 'days', header: 'Days', align: 'right' },
      { key: 'reason', header: 'Reason' },
      { key: 'status', header: 'Status', render: (r) => <Badge status={r.status} /> },
    ],
    expenses: [
      { key: 'user', header: 'Employee', render: (r) => r.user?.name },
      { key: 'date', header: 'Date', render: (r) => date(r.date) },
      { key: 'category', header: 'Category', render: (r) => label(r.category) + (r.travelMode ? ` · ${r.travelMode}` : '') },
      { key: 'km', header: 'Km', align: 'right', render: (r) => (r.distanceKm != null ? `${r.distanceKm}${r.autoCalculated ? ' (GPS)' : ''}` : '-') },
      { key: 'amount', header: 'Amount', align: 'right', render: (r) => inr(r.amount) },
      { key: 'bills', header: 'Bills', render: (r) => (r.bills?.length ? r.bills.map((b, i) => <Button key={b._id} size="s" variant="ghost" onClick={(e) => { e.stopPropagation(); openFile(b._id); }}>#{i + 1}</Button>) : '-') },
      { key: 'status', header: 'Status', render: (r) => <Badge status={r.status} /> },
    ],
    claims: [
      { key: 'claimNo', header: 'Claim', render: (r) => <span className="mono">{r.claimNo}</span> },
      { key: 'distributor', header: 'Distributor', render: (r) => r.distributor?.name },
      { key: 'type', header: 'Type', render: (r) => `${label(r.type)}${r.schemeName ? ` · ${r.schemeName}` : ''}` },
      { key: 'amount', header: 'Claimed', align: 'right', render: (r) => inr(r.amount) },
      { key: 'approvedAmount', header: 'Approved', align: 'right', render: (r) => inr(r.approvedAmount) },
      { key: 'att', header: 'Docs', render: (r) => (r.attachments?.length ? r.attachments.map((b, i) => <Button key={b._id} size="s" variant="ghost" onClick={(e) => { e.stopPropagation(); openFile(b._id); }}>#{i + 1}</Button>) : '-') },
      { key: 'status', header: 'Status', render: (r) => <Badge status={r.status} /> },
    ],
    reports: [
      { key: 'user', header: 'Employee', render: (r) => r.user?.name },
      { key: 'date', header: 'Date', render: (r) => date(r.date) },
      { key: 'summary', header: 'Summary', render: (r) => <span title={r.summary}>{r.summary.slice(0, 90)}{r.summary.length > 90 ? '…' : ''}</span> },
      { key: 'stats', header: 'Visits / Km / Sales', render: (r) => `${r.stats?.visits ?? 0} / ${r.stats?.distanceKm ?? 0} / ${inr(r.stats?.salesValue)}` },
      { key: 'status', header: 'Status', render: (r) => <Badge status={r.status} /> },
    ],
  }[tab];

  const actionable = (r) =>
    (tab === 'leaves' && r.status === 'pending') ||
    (tab === 'expenses' && ['pending', 'approved'].includes(r.status)) ||
    (tab === 'claims' && ['pending', 'approved'].includes(r.status)) ||
    tab === 'reports';

  const reviewConfig = reviewing && {
    leaves: { options: [['approved', 'Approve'], ['rejected', 'Reject']], submit: (b) => api.post(`/hr/leaves/${reviewing._id}/review`, b) },
    expenses:
      reviewing.status === 'approved'
        ? { options: [['reimbursed', 'Mark reimbursed']], submit: (b) => api.post(`/expenses/${reviewing._id}/reimburse`, { reference: b.comment }) }
        : { options: [['approved', 'Approve'], ['rejected', 'Reject']], withAmount: true, submit: (b) => api.post(`/expenses/${reviewing._id}/review`, b) },
    claims:
      reviewing.status === 'approved'
        ? { options: [['settled', 'Mark settled']], submit: (b) => api.post(`/claims/${reviewing._id}/review`, { status: 'settled', settlementRef: b.comment }) }
        : { options: [['approved', 'Approve'], ['revision_requested', 'Ask revision'], ['rejected', 'Reject']], withAmount: true, submit: (b) => api.post(`/claims/${reviewing._id}/review`, { status: b.status, approvedAmount: b.approvedAmount, note: b.comment }) },
    reports: { options: [['approved', 'Approve'], ['needs_changes', 'Needs changes']], submit: (b) => api.post(`/team/work-reports/${reviewing._id}/review`, b) },
  }[tab];

  return (
    <>
      <PageHeader title="Approvals" subtitle="Leaves, expense claims, partner claims and daily work reports" />
      <Card>
        <Tabs tabs={[['leaves', 'Leaves'], ['expenses', 'Expenses'], ['claims', 'Partner claims'], ['reports', 'Work reports']]} value={tab} onChange={(t) => { setTab(t); setStatus(STATUS[t][0]); setPage(1); }} />
        <div className="filters">
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            {STATUS[tab].map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
          {tab === 'expenses' && list.data?.totals && (
            <span className="muted" style={{ alignSelf: 'center' }}>
              {list.data.totals.map((t) => `${label(t._id)}: ${inr(t.amount)}`).join(' · ')}
            </span>
          )}
        </div>
        <DataTable
          columns={[...columns, { key: 'act', header: '', align: 'right', render: (r) => actionable(r) && <Button size="s" onClick={(e) => { e.stopPropagation(); setReviewing(r); }}>Review</Button> }]}
          rows={list.data?.items}
          loading={list.loading}
          error={list.error}
          page={page}
          total={list.data?.total}
          limit={list.data?.limit || 20}
          onPage={setPage}
        />
      </Card>
      {reviewConfig && (
        <ReviewModal
          open
          title={`Review ${tab === 'claims' ? reviewing.claimNo : label(tab.slice(0, -1))}`}
          options={reviewConfig.options}
          withAmount={reviewConfig.withAmount}
          defaultAmount={reviewing.amount}
          onClose={() => setReviewing(null)}
          onSubmit={async (b) => { await reviewConfig.submit(b); list.reload(); }}
        />
      )}
    </>
  );
}
