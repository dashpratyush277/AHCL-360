import { useState } from 'react';
import MapView from '../components/MapView.jsx';
import { Badge, Button, Card, DataTable, EditModal, FormFields, Modal, PageHeader, clean, useAction } from '../components/ui.jsx';
import { api } from '../lib/api';
import { label } from '../lib/format';
import { useApi } from '../lib/hooks';

export default function Geo() {
  const territories = useApi('/admin/territories');
  const fences = useApi('/admin/geofences');
  const [editT, setEditT] = useState(null);
  const [editG, setEditG] = useState(null);
  const [run] = useAction();

  return (
    <>
      <PageHeader title="Territories & Geofences" subtitle="Territories group users and distributors; geofences validate attendance check-ins">
        <Button variant="ghost" onClick={() => setEditT({})}>+ Territory</Button>
        <Button onClick={() => setEditG({ kind: 'office', radiusM: 200, enforce: false, isActive: true })}>+ Geofence</Button>
      </PageHeader>
      <div className="grid grid-2">
        <Card title="Geofences">
          <MapView circles={(fences.data?.items || []).filter((g) => g.isActive).map((g) => ({ lat: g.center.lat, lng: g.center.lng, radius: g.radiusM, label: `${g.name} (${g.radiusM} m)` }))} />
          <DataTable
            rows={fences.data?.items}
            loading={fences.loading}
            onRowClick={(g) => setEditG({ ...g, territory: g.territory?._id })}
            columns={[
              { key: 'name', header: 'Name' },
              { key: 'kind', header: 'Kind', render: (g) => label(g.kind) },
              { key: 'radiusM', header: 'Radius', align: 'right', render: (g) => `${g.radiusM} m` },
              { key: 'enforce', header: 'Mode', render: (g) => <Badge status={g.enforce ? 'rejected' : 'pending'}>{g.enforce ? 'Block outside' : 'Flag only'}</Badge> },
              { key: 'scope', header: 'Applies to', render: (g) => (g.users?.length ? `${g.users.length} users` : g.territory?.name || 'Everyone') },
              { key: 'x', header: '', align: 'right', render: (g) => <Button size="s" variant="ghost" onClick={(e) => { e.stopPropagation(); run(() => api.del(`/admin/geofences/${g._id}`), 'Deleted').then(fences.reload); }}>Delete</Button> },
            ]}
          />
        </Card>
        <Card title="Territories">
          <DataTable
            rows={territories.data?.items}
            loading={territories.loading}
            onRowClick={setEditT}
            columns={[
              { key: 'code', header: 'Code', render: (t) => <span className="mono">{t.code}</span> },
              { key: 'name', header: 'Name' },
              { key: 'region', header: 'Region' },
              { key: 'x', header: '', align: 'right', render: (t) => <Button size="s" variant="ghost" onClick={(e) => { e.stopPropagation(); run(() => api.del(`/admin/territories/${t._id}`), 'Deleted').then(territories.reload); }}>Delete</Button> },
            ]}
          />
        </Card>
      </div>

      <EditModal
        open={Boolean(editT)}
        title={editT?._id ? 'Edit territory' : 'New territory'}
        initial={editT}
        onClose={() => setEditT(null)}
        fields={[
          { name: 'name', label: 'Name', required: true },
          { name: 'code', label: 'Code', required: true },
          { name: 'region', label: 'Region' },
          { name: 'description', label: 'Description', type: 'textarea' },
        ]}
        onSubmit={async ({ _id, createdAt, updatedAt, __v, ...v }) => {
          if (_id) await api.patch(`/admin/territories/${_id}`, v);
          else await api.post('/admin/territories', v);
          territories.reload();
        }}
      />
      {editG && <GeofenceModal initial={editG} territories={territories.data?.items || []} onClose={() => setEditG(null)} onSaved={fences.reload} />}
    </>
  );
}

function GeofenceModal({ initial, territories, onClose, onSaved }) {
  const [v, setV] = useState(initial);
  const [run, busy] = useAction();
  const save = () => {
    const { _id, createdAt, updatedAt, __v, users, ...body } = clean(v);
    return run(() => (_id ? api.patch(`/admin/geofences/${_id}`, body) : api.post('/admin/geofences', body)), 'Geofence saved')
      .then(() => { onSaved(); onClose(); })
      .catch(() => {});
  };
  return (
    <Modal open wide title={v._id ? 'Edit geofence' : 'New geofence'} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>Click on the map to set the centre.</p>
      <MapView
        height={300}
        fit={false}
        onClick={(c) => setV({ ...v, center: c })}
        circles={v.center ? [{ ...v.center, radius: v.radiusM || 200 }] : []}
        markers={v.center ? [v.center] : []}
      />
      <div style={{ marginTop: 12 }}>
        <FormFields
          value={v}
          onChange={setV}
          fields={[
            { name: 'name', label: 'Name', required: true },
            { name: 'kind', label: 'Kind', type: 'select', options: ['office', 'territory', 'client'] },
            { name: 'center.lat', label: 'Latitude', type: 'number', step: 'any', required: true },
            { name: 'center.lng', label: 'Longitude', type: 'number', step: 'any', required: true },
            { name: 'radiusM', label: 'Radius (m)', type: 'number', required: true },
            { name: 'territory', label: 'Only for territory', type: 'select', options: territories.map((t) => [t._id, t.name]) },
            { name: 'enforce', label: 'Block check-in outside fence', type: 'checkbox' },
            { name: 'isActive', label: 'Active', type: 'checkbox' },
          ]}
        />
      </div>
      <div className="modal-foot">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !v.center?.lat || !v.name} onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}
