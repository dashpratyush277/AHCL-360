import { useEffect, useState } from 'react';
import MapView from '../components/MapView.jsx';
import { Badge, Card, DataTable, PageHeader, Stat, Tabs } from '../components/ui.jsx';
import { dt, time, today } from '../lib/format';
import { useApi } from '../lib/hooks';

export default function Tracking() {
  const [tab, setTab] = useState('live');
  return (
    <>
      <PageHeader title="Live Tracking & Route History" subtitle="GPS is collected only during each employee's office hours" />
      <Tabs tabs={[['live', 'Live map'], ['route', 'Route history'], ['attendance', "Today's attendance"]]} value={tab} onChange={setTab} />
      {tab === 'live' && <Live />}
      {tab === 'route' && <Route />}
      {tab === 'attendance' && <TeamAttendance />}
    </>
  );
}

function Live() {
  const live = useApi('/tracking/live');
  useEffect(() => {
    const t = setInterval(live.reload, 30_000);
    return () => clearInterval(t);
  }, [live.reload]);
  const items = live.data?.items || [];
  return (
    <div className="grid grid-2">
      <Card title={`Active in last 30 min (${items.length})`}>
        <MapView markers={items.map((i) => ({ lat: i.lat, lng: i.lng, label: `${i.user?.name} · ${time(i.recordedAt)}${i.battery != null ? ` · 🔋${Math.round(i.battery * 100)}%` : ''}` }))} />
      </Card>
      <Card title="Field staff">
        <DataTable
          rows={items}
          loading={live.loading}
          empty="Nobody has sent a location in the last 30 minutes."
          columns={[
            { key: 'name', header: 'Employee', render: (i) => i.user?.name },
            { key: 'at', header: 'Last seen', render: (i) => time(i.recordedAt) },
            { key: 'speed', header: 'Speed', render: (i) => (i.speed != null ? `${Math.round(i.speed * 3.6)} km/h` : '-') },
            { key: 'battery', header: 'Battery', render: (i) => (i.battery != null ? `${Math.round(i.battery * 100)}%` : '-') },
          ]}
        />
      </Card>
    </div>
  );
}

function Route() {
  const users = useApi('/admin/users?userType=employee&limit=200');
  const [user, setUser] = useState('');
  const [day, setDay] = useState(today());
  const route = useApi(user ? `/tracking/route?user=${user}&date=${day}` : null);
  const r = route.data;
  return (
    <>
      <div className="filters">
        <select value={user} onChange={(e) => setUser(e.target.value)}>
          <option value="">Select employee…</option>
          {(users.data?.items || []).filter((u) => !['super_admin', 'admin'].includes(u.role)).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
        </select>
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </div>
      {r && (
        <div className="grid grid-stats" style={{ marginBottom: 16 }}>
          <Stat label="Distance travelled" value={`${r.distanceKm} km`} />
          <Stat label="GPS points" value={r.points.length} />
          <Stat label="Client visits" value={r.visits.length} />
          <Stat label="Location mismatches" value={r.visits.filter((v) => !v.locationValid).length} tone={r.visits.some((v) => !v.locationValid) ? 'warn' : undefined} />
        </div>
      )}
      <div className="grid grid-2">
        <Card title="Route map">
          <MapView
            path={r?.points.map((p) => [p.lat, p.lng])}
            markers={(r?.visits || []).map((v, i) => ({ lat: v.checkIn.lat, lng: v.checkIn.lng, color: v.locationValid ? '#0f6e4f' : '#b42318', label: `${i + 1}. ${v.clientName} · ${time(v.checkIn.time)}` }))}
          />
        </Card>
        <Card title="Visits">
          <DataTable
            rows={r?.visits}
            loading={route.loading}
            empty={user ? 'No visits on this day.' : 'Pick an employee and a date.'}
            columns={[
              { key: 'client', header: 'Client', render: (v) => v.clientName },
              { key: 'purpose', header: 'Purpose' },
              { key: 'in', header: 'In / Out', render: (v) => `${time(v.checkIn.time)} – ${time(v.checkOut?.time)}` },
              { key: 'km', header: 'Km', align: 'right', render: (v) => v.distanceKm },
              { key: 'loc', header: 'Location', render: (v) => <Badge status={v.locationValid ? 'approved' : 'rejected'}>{v.locationValid ? 'Valid' : 'Mismatch'}</Badge> },
            ]}
          />
        </Card>
      </div>
    </>
  );
}

function TeamAttendance() {
  const [day, setDay] = useState(today());
  const list = useApi(`/attendance/team?date=${day}`);
  return (
    <Card>
      <div className="filters"><input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></div>
      <DataTable
        rows={list.data?.items}
        loading={list.loading}
        error={list.error}
        columns={[
          { key: 'name', header: 'Employee', render: (r) => r.user.name },
          { key: 'in', header: 'Check-in', render: (r) => dt(r.attendance?.checkIn?.time) },
          { key: 'out', header: 'Check-out', render: (r) => dt(r.attendance?.checkOut?.time) },
          { key: 'fence', header: 'Geofence', render: (r) => (r.attendance?.checkIn ? <Badge status={r.attendance.checkIn.withinGeofence === false ? 'rejected' : 'approved'}>{r.attendance.checkIn.withinGeofence === false ? 'Outside' : r.attendance.checkIn.geofence || 'OK'}</Badge> : '-') },
          { key: 'status', header: 'Status', render: (r) => <Badge status={r.attendance?.status || 'absent'} /> },
        ]}
      />
    </Card>
  );
}
