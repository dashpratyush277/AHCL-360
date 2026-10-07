import { useState } from 'react';
import { Badge, Button, Card, DataTable, EditModal, PageHeader } from '../components/ui.jsx';
import { api, qs } from '../lib/api';
import { inr } from '../lib/format';
import { useApi, useDebounced } from '../lib/hooks';

export default function Products() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState(null);
  const query = useDebounced(q);
  const list = useApi(`/products${qs({ q: query, category, all: 1 })}`);

  return (
    <>
      <PageHeader title="Product Catalog" subtitle="The dynamic catalog partners order from. Prices exclude GST.">
        <Button onClick={() => setEditing({ unit: 'pcs', gstRate: 18, isActive: true })}>+ Add product</Button>
      </PageHeader>
      <Card>
        <div className="filters">
          <input placeholder="Search name or SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {(list.data?.categories || []).filter(Boolean).map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <DataTable
          rows={list.data?.items}
          loading={list.loading}
          error={list.error}
          onRowClick={setEditing}
          columns={[
            { key: 'sku', header: 'SKU', render: (p) => <span className="mono">{p.sku}</span> },
            { key: 'name', header: 'Product', render: (p) => <strong>{p.name}</strong> },
            { key: 'category', header: 'Category' },
            { key: 'unit', header: 'Unit' },
            { key: 'price', header: 'Price', align: 'right', render: (p) => inr(p.price) },
            { key: 'mrp', header: 'MRP', align: 'right', render: (p) => inr(p.mrp) },
            { key: 'gstRate', header: 'GST', align: 'right', render: (p) => `${p.gstRate}%` },
            { key: 'hsn', header: 'HSN', render: (p) => <span className="mono">{p.hsn || '-'}</span> },
            { key: 'reorder', header: 'Reorder lvl', align: 'right', render: (p) => p.defaultReorderLevel },
            { key: 'status', header: 'Status', render: (p) => <Badge status={p.isActive ? 'active' : 'closed'}>{p.isActive ? 'Active' : 'Hidden'}</Badge> },
          ]}
        />
      </Card>
      <EditModal
        open={Boolean(editing)}
        wide
        title={editing?._id ? `Edit ${editing.name}` : 'New product'}
        initial={editing}
        onClose={() => setEditing(null)}
        fields={[
          { name: 'sku', label: 'SKU', required: true },
          { name: 'name', label: 'Name', required: true },
          { name: 'category', label: 'Category' },
          { name: 'unit', label: 'Unit', type: 'select', options: ['pcs', 'box', 'bag', 'btl', 'kit', 'pkt', 'kg', 'ltr'] },
          { name: 'packSize', label: 'Pack size', type: 'number' },
          { name: 'price', label: 'Distributor price (₹, excl. GST)', type: 'number', step: '0.01', required: true },
          { name: 'mrp', label: 'MRP (₹)', type: 'number', step: '0.01' },
          { name: 'gstRate', label: 'GST rate', type: 'select', options: [[0, '0%'], [5, '5%'], [12, '12%'], [18, '18%'], [28, '28%']] },
          { name: 'hsn', label: 'HSN code' },
          { name: 'defaultReorderLevel', label: 'Default reorder level', type: 'number' },
          { name: 'description', label: 'Description', type: 'textarea' },
          { name: 'isActive', label: 'Visible in catalog', type: 'checkbox' },
        ]}
        onSubmit={async ({ _id, createdAt, updatedAt, __v, id, image, ...v }) => {
          const body = { ...v, gstRate: Number(v.gstRate ?? 18) };
          if (_id) await api.patch(`/products/${_id}`, body);
          else await api.post('/products', body);
          list.reload();
        }}
      />
    </>
  );
}
