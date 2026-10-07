import { useState } from 'react';
import { Badge, Button, Card, DataTable, Modal, PageHeader, useAction } from '../components/ui.jsx';
import { api, qs } from '../lib/api';
import { date, label } from '../lib/format';
import { useApi, useDebounced } from '../lib/hooks';

export default function Retailers() {
  const [q, setQ] = useState('');
  const [distributor, setDistributor] = useState('');
  const [kycStatus, setKycStatus] = useState('');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState(null);
  const query = useDebounced(q);
  const list = useApi(`/retailers${qs({ q: query, distributor, kycStatus, sort, page, limit: 25 })}`);
  const dists = useApi('/distributors?limit=200');
  const [run] = useAction();

  const review = (r, status) => run(() => api.post(`/retailers/${r._id}/kyc-review`, { status }), `KYC ${status}`).then(() => { list.reload(); setViewing(null); });

  return (
    <>
      <PageHeader title="Retailers" subtitle="Retailers onboarded by distributors and field staff, linked by distributor code" />
      <Card>
        <div className="filters">
          <input placeholder="Search name, shop, mobile, city…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <select value={distributor} onChange={(e) => { setDistributor(e.target.value); setPage(1); }}>
            <option value="">All distributors</option>
            {(dists.data?.items || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
          <select value={kycStatus} onChange={(e) => { setKycStatus(e.target.value); setPage(1); }}>
            <option value="">Any KYC status</option>
            {['pending', 'verified', 'rejected'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">Sort: Name A–Z</option>
            <option value="-createdAt">Sort: Newest first</option>
            <option value="city">Sort: City</option>
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
            { key: 'name', header: 'Retailer', render: (r) => <><strong>{r.shopName || r.name}</strong><div className="muted">{r.name}</div></> },
            { key: 'mobile', header: 'Mobile', render: (r) => r.contact?.mobile },
            { key: 'city', header: 'City', render: (r) => r.city || '-' },
            { key: 'dist', header: 'Distributor', render: (r) => <span className="mono">{r.distributorCode}</span> },
            { key: 'gps', header: 'GPS', render: (r) => (r.location?.lat ? '✓' : '-') },
            { key: 'kyc', header: 'KYC', render: (r) => <Badge status={r.kyc?.status || 'pending'} /> },
            { key: 'createdAt', header: 'Added', render: (r) => date(r.createdAt) },
          ]}
        />
      </Card>
      {viewing && (
        <Modal open title={viewing.shopName || viewing.name} onClose={() => setViewing(null)}>
          <dl className="kv">
            <dt>Owner</dt><dd>{viewing.name}</dd>
            <dt>Contact</dt><dd>{viewing.contact?.mobile} {viewing.contact?.email}</dd>
            <dt>Address</dt><dd>{[viewing.address, viewing.city, viewing.pincode].filter(Boolean).join(', ') || '-'}</dd>
            <dt>Location</dt><dd>{viewing.location?.lat ? <a target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${viewing.location.lat},${viewing.location.lng}`}>Open in Maps</a> : '-'}</dd>
            <dt>Distributor</dt><dd>{viewing.distributor?.name} ({viewing.distributorCode})</dd>
            <dt>GSTIN</dt><dd className="mono">{viewing.kyc?.gstin || '-'}</dd>
            <dt>PAN</dt><dd className="mono">{viewing.kyc?.pan || '-'}</dd>
            <dt>Aadhaar</dt><dd className="mono">{viewing.kyc?.aadhaar || '-'}</dd>
            <dt>KYC documents</dt>
            <dd className="row gap-s wrap">
              {[['panFile', 'PAN'], ['aadhaarFile', 'Aadhaar'], ['gstFile', 'GST']].filter(([k]) => viewing.kyc?.[k]).map(([k, l]) => (
                <Button key={k} size="s" variant="ghost" onClick={() => run(() => api.open(`/files/${viewing.kyc[k]}`))}>{l}</Button>
              ))}
              {!['panFile', 'aadhaarFile', 'gstFile'].some((k) => viewing.kyc?.[k]) && '-'}
            </dd>
            <dt>KYC status</dt><dd><Badge status={viewing.kyc?.status || 'pending'} /></dd>
          </dl>
          {viewing.kyc?.status !== 'verified' && (
            <div className="modal-foot">
              <Button variant="danger" onClick={() => review(viewing, 'rejected')}>Reject KYC</Button>
              <Button onClick={() => review(viewing, 'verified')}>Verify KYC</Button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
