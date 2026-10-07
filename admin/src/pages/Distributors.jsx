import { useState } from 'react';
import { Badge, Button, Card, DataTable, EditModal, Modal, PageHeader, Tabs } from '../components/ui.jsx';
import { api, qs } from '../lib/api';
import { date, inr, label } from '../lib/format';
import { useApi, useDebounced } from '../lib/hooks';

export default function Distributors() {
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const query = useDebounced(q);
  const list = useApi(`/distributors${qs({ q: query, tier, page, limit: 25 })}`);
  const all = useApi('/distributors?limit=200');
  const territories = useApi('/admin/territories');
  const employees = useApi('/admin/users?userType=employee&limit=200');

  const fields = [
    { name: 'name', label: 'Business name', required: true },
    { name: 'code', label: 'Distributor code', required: true, hint: 'Unique, e.g. DS-OD-102' },
    { name: 'tier', label: 'Tier', type: 'select', required: true, options: ['super_distributor', 'distributor', 'stockist'] },
    { name: 'parent', label: 'Parent (super distributor)', type: 'select', options: (all.data?.items || []).filter((d) => d.tier === 'super_distributor' && d._id !== editing?._id).map((d) => [d._id, d.name]) },
    { name: 'gstin', label: 'GSTIN', hint: 'State code is derived from GSTIN' },
    { name: 'pan', label: 'PAN' },
    { name: 'contact.person', label: 'Contact person' },
    { name: 'contact.mobile', label: 'Contact mobile' },
    { name: 'contact.email', label: 'Contact email' },
    { name: 'territory', label: 'Territory', type: 'select', options: (territories.data?.items || []).map((t) => [t._id, t.name]) },
    { name: 'assignedEmployee', label: 'Assigned field employee', type: 'select', options: (employees.data?.items || []).filter((u) => ['field_executive', 'manager', 'staff'].includes(u.role)).map((u) => [u._id, u.name]) },
    { name: 'creditLimit', label: 'Credit limit (₹)', type: 'number' },
    { name: 'location.lat', label: 'Latitude', type: 'number', step: 'any' },
    { name: 'location.lng', label: 'Longitude', type: 'number', step: 'any' },
    { name: 'address', label: 'Address', type: 'textarea' },
    { name: 'isActive', label: 'Active', type: 'checkbox' },
  ];

  const save = async ({ _id, createdAt, updatedAt, __v, id, assignedEmployee, assignedEmployees, ...v }) => {
    const body = { ...v, assignedEmployees: assignedEmployee ? [assignedEmployee] : [] };
    if (_id) await api.patch(`/distributors/${_id}`, body);
    else await api.post('/distributors', body);
    list.reload();
    all.reload();
  };

  return (
    <>
      <PageHeader title="Distributors" subtitle="Super distributors, distributors and stockists; their stock, orders and mapped staff">
        <Button onClick={() => setEditing({ tier: 'distributor', isActive: true })}>+ Add distributor</Button>
      </PageHeader>
      <Card>
        <div className="filters">
          <input placeholder="Search name or code…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <select value={tier} onChange={(e) => { setTier(e.target.value); setPage(1); }}>
            <option value="">All tiers</option>
            {['super_distributor', 'distributor', 'stockist'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
        </div>
        <DataTable
          rows={list.data?.items}
          loading={list.loading}
          error={list.error}
          page={page}
          total={list.data?.total}
          limit={25}
          onPage={setPage}
          onRowClick={setViewing}
          columns={[
            { key: 'code', header: 'Code', render: (d) => <span className="mono">{d.code}</span> },
            { key: 'name', header: 'Name', render: (d) => <strong>{d.name}</strong> },
            { key: 'tier', header: 'Tier', render: (d) => label(d.tier) },
            { key: 'territory', header: 'Territory', render: (d) => d.territory?.name || '-' },
            { key: 'emp', header: 'Field staff', render: (d) => d.assignedEmployees?.map((e) => e.name).join(', ') || '-' },
            { key: 'gstin', header: 'GSTIN', render: (d) => <span className="mono">{d.gstin || '-'}</span> },
            { key: 'status', header: 'Status', render: (d) => <Badge status={d.isActive ? 'active' : 'closed'}>{d.isActive ? 'Active' : 'Inactive'}</Badge> },
            {
              key: 'x', header: '', align: 'right',
              render: (d) => <Button size="s" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing({ ...d, territory: d.territory?._id, assignedEmployee: d.assignedEmployees?.[0]?._id, parent: d.parent?._id || d.parent }); }}>Edit</Button>,
            },
          ]}
        />
      </Card>
      <EditModal open={Boolean(editing)} wide title={editing?._id ? `Edit ${editing.name}` : 'New distributor'} fields={fields} initial={editing} onClose={() => setEditing(null)} onSubmit={save} />
      {viewing && <DistributorDetail d={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

function DistributorDetail({ d, onClose }) {
  const [tab, setTab] = useState('stock');
  const stock = useApi(tab === 'stock' ? `/stock?distributor=${d._id}` : null);
  const txns = useApi(tab === 'ledger' ? `/stock/txns?distributor=${d._id}&from=2000-01-01&limit=50` : null);
  const reorder = useApi(tab === 'reorder' ? `/stock/reorder-suggestions?distributor=${d._id}` : null);
  const orders = useApi(tab === 'orders' ? `/orders?distributor=${d._id}&limit=50` : null);

  return (
    <Modal open wide title={`${d.name} (${d.code})`} onClose={onClose}>
      <Tabs tabs={[['stock', 'Closing stock'], ['ledger', 'Stock ledger'], ['reorder', 'Reorder suggestions'], ['orders', 'Orders']]} value={tab} onChange={setTab} />
      {tab === 'stock' && (
        <DataTable
          rows={stock.data?.items}
          loading={stock.loading}
          columns={[
            { key: 'sku', header: 'SKU', render: (s) => <span className="mono">{s.sku}</span> },
            { key: 'name', header: 'Product' },
            { key: 'stockIn', header: 'In', align: 'right' },
            { key: 'stockOut', header: 'Out', align: 'right' },
            { key: 'returned', header: 'Returned', align: 'right' },
            { key: 'adjustment', header: 'Adj.', align: 'right' },
            { key: 'closing', header: 'Closing', align: 'right', render: (s) => <strong>{s.closing} {s.unit}</strong> },
          ]}
        />
      )}
      {tab === 'ledger' && (
        <DataTable
          rows={txns.data?.items}
          loading={txns.loading}
          columns={[
            { key: 'date', header: 'Date', render: (t) => date(t.date) },
            { key: 'product', header: 'Product', render: (t) => t.product?.name },
            { key: 'type', header: 'Type', render: (t) => <Badge status={{ in: 'approved', out: 'packed', return: 'pending', adjustment: 'rejected' }[t.type]}>{label(t.type)}</Badge> },
            { key: 'delta', header: 'Qty', align: 'right', render: (t) => (t.delta > 0 ? `+${t.delta}` : t.delta) },
            { key: 'reason', header: 'Reason / Ref', render: (t) => t.reason || t.reference || '-' },
            { key: 'by', header: 'By', render: (t) => t.createdBy?.name || '-' },
          ]}
        />
      )}
      {tab === 'reorder' && (
        <DataTable
          rows={reorder.data?.items}
          loading={reorder.loading}
          empty="All products are above their reorder level."
          columns={[
            { key: 'name', header: 'Product' },
            { key: 'closing', header: 'Closing', align: 'right' },
            { key: 'reorderLevel', header: 'Reorder level', align: 'right' },
            { key: 'avgDailySales', header: 'Avg daily sales', align: 'right' },
            { key: 'suggestedQty', header: 'Suggested order', align: 'right', render: (r) => <strong>{r.suggestedQty} {r.unit}</strong> },
          ]}
        />
      )}
      {tab === 'orders' && (
        <DataTable
          rows={orders.data?.items}
          loading={orders.loading}
          columns={[
            { key: 'orderNo', header: 'Order', render: (o) => <span className="mono">{o.orderNo}</span> },
            { key: 'createdAt', header: 'Date', render: (o) => date(o.createdAt) },
            { key: 'grandTotal', header: 'Total', align: 'right', render: (o) => inr(o.grandTotal) },
            { key: 'status', header: 'Status', render: (o) => <Badge status={o.status} /> },
          ]}
        />
      )}
    </Modal>
  );
}
