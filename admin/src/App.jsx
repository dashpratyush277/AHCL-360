import { Suspense, lazy, useCallback, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Button, Spinner } from './components/ui.jsx';
import { api, setSession } from './lib/api';
import { useApi, useIdleLogout, useSession } from './lib/hooks';
import Login from './pages/Login.jsx';

const Approvals = lazy(() => import('./pages/Approvals.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Distributors = lazy(() => import('./pages/Distributors.jsx'));
const Geo = lazy(() => import('./pages/Geo.jsx'));
const Hr = lazy(() => import('./pages/Hr.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const Orders = lazy(() => import('./pages/Orders.jsx'));
const Products = lazy(() => import('./pages/Products.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const Retailers = lazy(() => import('./pages/Retailers.jsx'));
const Support = lazy(() => import('./pages/Support.jsx'));
const Targets = lazy(() => import('./pages/Targets.jsx'));
const Tracking = lazy(() => import('./pages/Tracking.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));

const NAV = [
  ['Overview', [['/', 'Dashboard']]],
  ['People', [['/users', 'Employees & Users'], ['/approvals', 'Approvals'], ['/hr', 'HR & Payroll'], ['/targets', 'Targets']]],
  ['Field', [['/tracking', 'Live Tracking & Routes'], ['/geo', 'Territories & Geofences']]],
  ['Distribution', [['/distributors', 'Distributors'], ['/retailers', 'Retailers'], ['/products', 'Products'], ['/orders', 'Orders & Invoices']]],
  ['Communication', [['/notifications', 'Broadcast'], ['/support', 'Support Tickets']]],
  ['Insights', [['/reports', 'Reports']]],
];

export default function App() {
  const session = useSession();
  if (!session?.accessToken) return <Login />;
  return <Shell session={session} />;
}

function Shell({ session }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { data: unread } = useApi(`/notifications?limit=1&_=${location.pathname}`);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', { refreshToken: session.refreshToken });
    } finally {
      setSession(null);
    }
  }, [session.refreshToken]);
  useIdleLogout(session.idleTimeoutMinutes || 30, logout);

  const isAdmin = ['super_admin', 'admin'].includes(session.user.role);

  return (
    <div className="layout">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)}>
        <div className="brand">
          <span className="brand-mark">360</span> AHCL Admin
        </div>
        <nav className="nav">
          {NAV.map(([group, links]) => (
            <div key={group}>
              <div className="nav-group">{group}</div>
              {links.map(([to, l]) => (
                <NavLink key={to} to={to} end={to === '/'}>{l}</NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <Button variant="ghost" size="s" className="menu-btn" onClick={() => setMenuOpen(true)}>☰ Menu</Button>
          {unread?.unread > 0 && <span className="badge badge-warn">{unread.unread} unread</span>}
          <span className="muted">{session.user.name} · {session.user.role.replace('_', ' ')}</span>
          <Button variant="ghost" size="s" onClick={logout}>Log out</Button>
        </div>
        {!isAdmin && (
          <div className="error-box" style={{ marginBottom: 16 }}>
            You are signed in as a manager. Admin-only actions (user management, products, broadcast) will be rejected.
          </div>
        )}
        <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/users" element={<Users />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/hr" element={<Hr />} />
          <Route path="/targets" element={<Targets />} />
          <Route path="/tracking" element={<Tracking />} />
          <Route path="/geo" element={<Geo />} />
          <Route path="/distributors" element={<Distributors />} />
          <Route path="/retailers" element={<Retailers />} />
          <Route path="/products" element={<Products />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/support" element={<Support />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        </Suspense>
      </main>
    </div>
  );
}
