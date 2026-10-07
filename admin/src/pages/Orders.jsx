import { useState } from 'react';
import { Badge, Button, Card, DataTable, Field, Modal, PageHeader, Tabs, useAction } from '../components/ui.jsx';
import { api, qs } from '../lib/api';
import { date, dt, inr, label } from '../lib/format';
import { useApi, useDebounced } from '../lib/hooks';

const NEXT = { processing: ['packed', 'cancelled'], packed: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };

export default function Orders() {
  const [tab, setTab] = useState('orders');
  return (
    <>
      <PageHeader title="Orders & Invoices" subtitle="Move orders through Processing → Packed → Shipped → Delivered. Packing generates the GST invoice; delivery posts stock-in." />
      <Tabs tabs={[['orders', 'Orders'], ['invoices', 'Invoices']]} value={tab} onChange={setTab} />
      {tab === 'orders' ? <OrderList /> : <InvoiceList />}
    </>
  );
}

function OrderList() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const query = useDebounced(q);
  const list = useApi(`/orders${qs({ status, q: query, page, limit: 25 })}`);
  return (
    <Card>
      <div className="filters">
        <input placeholder="Order number…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {Object.keys(NEXT).map((s) => <option key={s} value={s}>{label(s)}</option>)}
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
        onRowClick={(o) => setOpen(o._id)}
        columns={[
          { key: 'orderNo', header: 'Order', render: (o) => <span className="mono">{o.orderNo}</span> },
          { key: 'createdAt', header: 'Placed', render: (o) => dt(o.createdAt) },
          { key: 'dist', header: 'Distributor', render: (o) => o.distributor?.name },
          { key: 'items', header: 'Lines', align: 'right', render: (o) => o.items.length },
          { key: 'grandTotal', header: 'Total', align: 'right', render: (o) => inr(o.grandTotal) },
          { key: 'invoice', header: 'Invoice', render: (o) => (o.invoice ? <span className="mono">{o.invoice.invoiceNo}</span> : '-') },
          { key: 'status', header: 'Status', render: (o) => <Badge status={o.status} /> },
        ]}
      />
      {open && <OrderDetail id={open} onClose={() => setOpen(null)} onChanged={list.reload} />}
    </Card>
  );
}

function OrderDetail({ id, onClose, onChanged }) {
  const { data: o, reload } = useApi(`/orders/${id}`);
  const [note, setNote] = useState('');
  const [tracking, setTracking] = useState('');
  const [run, busy] = useAction();
  if (!o) return null;
  const move = (status) =>
    run(() => api.post(`/orders/${id}/status`, { status, note: note || undefined, trackingInfo: tracking || undefined }), `Order ${status}`)
      .then(() => { reload(); onChanged(); setNote(''); })
      .catch(() => {});
  return (
    <Modal open wide title={`Order ${o.orderNo}`} onClose={onClose}>
      <div className="grid grid-2">
        <dl className="kv">
          <dt>Distributor</dt><dd>{o.distributor?.name} ({o.distributor?.code})</dd>
          <dt>Placed by</dt><dd>{o.placedBy?.name} · {dt(o.createdAt)}</dd>
          <dt>Ship to</dt><dd>{o.shippingAddress || '-'}</dd>
          <dt>Status</dt><dd><Badge status={o.status} /></dd>
          {o.trackingInfo && (<><dt>Tracking</dt><dd>{o.trackingInfo}</dd></>)}
          {o.notes && (<><dt>Notes</dt><dd>{o.notes}</dd></>)}
        </dl>
        <div>
          <strong>History</strong>
          <ul className="muted" style={{ paddingLeft: 18 }}>
            {o.statusHistory.map((h, i) => <li key={i}>{label(h.status)} · {dt(h.at)}{h.by?.name ? ` · ${h.by.name}` : ''}{h.note ? ` – ${h.note}` : ''}</li>)}
          </ul>
        </div>
      </div>
      <DataTable
        rows={o.items}
        columns={[
          { key: 'name', header: 'Item' },
          { key: 'qty', header: 'Qty', align: 'right', render: (i) => `${i.qty} ${i.unit}` },
          { key: 'price', header: 'Rate', align: 'right', render: (i) => inr(i.price) },
          { key: 'discountPct', header: 'Disc.', align: 'right', render: (i) => `${i.discountPct}%` },
          { key: 'taxable', header: 'Taxable', align: 'right', render: (i) => inr(i.taxable) },
          { key: 'tax', header: `GST`, align: 'right', render: (i) => `${inr(i.tax)} (${i.gstRate}%)` },
          { key: 'lineTotal', header: 'Total', align: 'right', render: (i) => inr(i.lineTotal) },
        ]}
      />
      <p style={{ textAlign: 'right' }}>
        Subtotal {inr(o.subtotal)} · Discount {inr(o.discountTotal)} · GST {inr(o.taxTotal)} · <strong>Grand total {inr(o.grandTotal)}</strong>
      </p>
      {NEXT[o.status].length > 0 && (
        <div className="form-grid">
          <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          {o.status === 'packed' && <Field label="Tracking / LR number"><input value={tracking} onChange={(e) => setTracking(e.target.value)} /></Field>}
        </div>
      )}
      <div className="modal-foot">
        {o.invoice && <Button variant="ghost" onClick={() => run(() => api.download(`/invoices/${o.invoice._id}/pdf`))}>Download invoice</Button>}
        {NEXT[o.status].map((s) => (
          <Button key={s} disabled={busy} variant={s === 'cancelled' ? 'danger' : 'primary'} onClick={() => move(s)}>Mark {label(s)}</Button>
        ))}
      </div>
    </Modal>
  );
}

function InvoiceList() {
  const [page, setPage] = useState(1);
  const list = useApi(`/invoices?page=${page}&limit=25`);
  const [run] = useAction();
  return (
    <Card>
      <DataTable
        rows={list.data?.items}
        loading={list.loading}
        page={page}
        total={list.data?.total}
        limit={25}
        onPage={setPage}
        columns={[
          { key: 'invoiceNo', header: 'Invoice', render: (i) => <span className="mono">{i.invoiceNo}</span> },
          { key: 'issuedAt', header: 'Date', render: (i) => date(i.issuedAt) },
          { key: 'buyer', header: 'Buyer', render: (i) => i.buyer?.name },
          { key: 'gstin', header: 'GSTIN', render: (i) => <span className="mono">{i.buyer?.gstin || '-'}</span> },
          { key: 'tax', header: 'Tax', render: (i) => (i.interState ? `IGST ${inr(i.igstTotal)}` : `CGST+SGST ${inr(i.cgstTotal + i.sgstTotal)}`) },
          { key: 'grandTotal', header: 'Total', align: 'right', render: (i) => inr(i.grandTotal) },
          { key: 'x', header: '', align: 'right', render: (i) => <Button size="s" variant="ghost" onClick={() => run(() => api.download(`/invoices/${i._id}/pdf`))}>PDF</Button> },
        ]}
      />
    </Card>
  );
}
