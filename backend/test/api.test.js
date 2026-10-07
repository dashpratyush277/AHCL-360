import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = '';
process.env.DISABLE_JOBS = 'true';

const { connectDb, disconnectDb } = await import('../src/config/db.js');
const { createApp } = await import('../src/app.js');
const { seed } = await import('../src/seed.js');
const { Distributor, Product, User } = await import('../src/models/index.js');

let app;
const tokens = {};

async function login(mobile, panel) {
  const res = await request(app).post('/api/auth/login').send({ identifier: mobile, password: 'Password@123', panel });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}
const as = (who) => ({
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${tokens[who]}`),
  post: (url, body) => request(app).post(url).set('Authorization', `Bearer ${tokens[who]}`).send(body),
  put: (url, body) => request(app).put(url).set('Authorization', `Bearer ${tokens[who]}`).send(body),
});

before(async () => {
  await connectDb();
  await seed();
  app = createApp();
  tokens.admin = (await login('9000000001', 'admin')).accessToken;
  tokens.manager = (await login('9000000002', 'employee')).accessToken;
  tokens.fe = (await login('9000000003', 'employee')).accessToken;
  tokens.partner = (await login('9100000002', 'partner')).accessToken;
});
after(disconnectDb);

describe('auth', () => {
  test('OTP login flow', async () => {
    const r1 = await request(app).post('/api/auth/otp/request').send({ identifier: '9000000003', panel: 'employee' });
    assert.equal(r1.status, 200);
    assert.match(r1.body.devCode, /^\d{6}$/);
    const bad = await request(app).post('/api/auth/otp/verify').send({ identifier: '9000000003', code: '000000' === r1.body.devCode ? '111111' : '000000' });
    assert.equal(bad.status, 401);
    const ok = await request(app).post('/api/auth/otp/verify').send({ identifier: '9000000003', code: r1.body.devCode, panel: 'employee' });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.refreshToken);
    const ref = await request(app).post('/api/auth/refresh').send({ refreshToken: ok.body.refreshToken });
    assert.equal(ref.status, 200);
    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: ok.body.refreshToken });
    assert.equal(reuse.status, 401, 'rotated refresh token must not be reusable');
  });

  test('panel separation', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: '9100000002', password: 'Password@123', panel: 'employee' });
    assert.equal(res.status, 403);
  });

  test('sensitive fields are masked and encrypted at rest', async () => {
    const res = await as('fe').post('/api/hr/kyc', { pan: 'ABCDE1234F', aadhaar: '123456789012' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.kyc.aadhaar, '********9012');
    const raw = await User.collection.findOne({ mobile: '9000000003' });
    assert.match(raw.kyc.aadhaar, /^enc:v1:/);
  });

  test('blocked user loses access immediately', async () => {
    const t = (await login('9000000004', 'employee')).accessToken;
    const u = await User.findOne({ mobile: '9000000004' });
    const block = await as('admin').post(`/api/admin/users/${u._id}/block`, { blocked: true, reason: 'test' });
    assert.equal(block.status, 200);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${t}`);
    assert.equal(me.status, 403);
    await as('admin').post(`/api/admin/users/${u._id}/block`, { blocked: false });
  });
});

describe('employee panel', () => {
  test('attendance check-in / check-out', async () => {
    const today = await as('fe').get('/api/attendance/today');
    assert.equal(today.status, 200);
    // seed checks field execs in at 09:35 IST; before that time, check in first
    if (!today.body.attendance?.checkIn) assert.equal((await as('fe').post('/api/attendance/check-in', { lat: 20.2961, lng: 85.8245 })).status, 201);
    const out = await as('fe').post('/api/attendance/check-out', { lat: 20.2961, lng: 85.8245 });
    assert.equal(out.status, 200, JSON.stringify(out.body));
    assert.ok(out.body.workMinutes >= 0);
    const month = await as('fe').get('/api/attendance/month');
    assert.equal(month.status, 200);
    assert.ok(month.body.days.length >= 28);
  });

  test('GPS pings, route and visits', async () => {
    const pings = await as('fe').post('/api/tracking/pings', { points: [{ lat: 20.3, lng: 85.82, recordedAt: new Date().toISOString() }] });
    assert.equal(pings.status, 200);
    assert.equal(pings.body.accepted + pings.body.ignored, 1); // ignored outside office hours
    const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const route = await as('fe').get(`/api/tracking/route?date=${yesterday}`);
    assert.equal(route.status, 200);
    assert.ok(route.body.distanceKm > 0);
    assert.ok(route.body.points.length > 0);
    const v = await as('fe').post('/api/visits', { clientName: 'Test Shop', purpose: 'Demo', lat: 20.3, lng: 85.82 });
    assert.equal(v.status, 201, JSON.stringify(v.body));
    const dup = await as('fe').post('/api/visits', { clientName: 'Another', purpose: 'Demo', lat: 20.3, lng: 85.82 });
    assert.equal(dup.status, 400, 'must check out of open visit first');
    const co = await as('fe').post(`/api/visits/${v.body._id}/check-out`, { lat: 20.3, lng: 85.82 });
    assert.equal(co.status, 200);
  });

  test('leave apply + manager approval', async () => {
    const l = await as('fe').post('/api/hr/leaves', { type: 'casual', from: '2030-01-10', to: '2030-01-12', reason: 'Family function' });
    assert.equal(l.status, 201, JSON.stringify(l.body));
    assert.equal(l.body.days, 3);
    const rv = await as('manager').post(`/api/hr/leaves/${l.body._id}/review`, { status: 'approved' });
    assert.equal(rv.status, 200);
    assert.equal(rv.body.status, 'approved');
    const self = await as('fe').post(`/api/hr/leaves/${l.body._id}/review`, { status: 'approved' });
    assert.equal(self.status, 403);
  });

  test('expense auto-calculated from GPS distance', async () => {
    const date = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const e = await as('fe').post('/api/expenses', { date, category: 'travel', travelMode: 'bike', useGpsDistance: true });
    assert.equal(e.status, 201, JSON.stringify(e.body));
    assert.equal(e.body.autoCalculated, true);
    assert.equal(e.body.amount, Math.round(e.body.distanceKm * 3.5 * 100) / 100);
    const rv = await as('manager').post(`/api/expenses/${e.body._id}/review`, { status: 'approved' });
    assert.equal(rv.status, 200);
    const re = await as('admin').post(`/api/expenses/${e.body._id}/reimburse`, { reference: 'NEFT123' });
    assert.equal(re.body.status, 'reimbursed');
  });

  test('DSO, targets, performance, work report', async () => {
    const d = await Distributor.findOne({ code: 'DS-OD-101' });
    const p = await Product.findOne();
    const dso = await as('fe').post('/api/dso', { distributor: String(d._id), items: [{ product: String(p._id), qty: 5 }] });
    assert.equal(dso.status, 201, JSON.stringify(dso.body));
    const t = await as('fe').get('/api/targets');
    assert.equal(t.status, 200);
    assert.ok(t.body.items[0].achieved.salesAmount > 0);
    const wr = await as('fe').post('/api/team/work-reports', { summary: 'Visited three retailers today' });
    assert.equal(wr.status, 201);
    const rv = await as('manager').post(`/api/team/work-reports/${wr.body._id}/review`, { status: 'approved', comment: 'Good', rating: 4 });
    assert.equal(rv.status, 200);
    const perf = await as('manager').get('/api/team/performance');
    assert.equal(perf.status, 200);
    assert.equal(perf.body.items.length, 2);
  });

  test('payslip pdf and reports', async () => {
    const list = await as('fe').get('/api/hr/payslips');
    assert.ok(list.body.items.length >= 1);
    const pdf = await as('fe').get(`/api/hr/payslips/${list.body.items[0].month}/pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers['content-type'], 'application/pdf');
    for (const type of ['daily-work', 'expense', 'visit-route', 'attendance']) {
      const r = await as('manager').get(`/api/reports/${type}?team=1&format=${type === 'expense' ? 'xlsx' : 'pdf'}`);
      assert.equal(r.status, 200, `${type}: ${r.text?.slice(0, 200)}`);
    }
  });

  test('offline sync is idempotent', async () => {
    const op = { clientId: 'offline-op-0001', type: 'visit.create', payload: { clientName: 'Offline Shop', purpose: 'Sync test', lat: 20.3, lng: 85.82, time: new Date().toISOString() } };
    const r1 = await as('manager').post('/api/sync', { ops: [op] });
    assert.equal(r1.body.results[0].status, 'ok', JSON.stringify(r1.body));
    const r2 = await as('manager').post('/api/sync', { ops: [op] });
    assert.equal(r2.body.results[0].status, 'duplicate');
  });
});

describe('partner panel', () => {
  let orderId;

  test('place order with server-side pricing', async () => {
    const p = await Product.findOne({ sku: 'AHCL-PST-01' });
    const res = await as('partner').post('/api/orders', { items: [{ product: String(p._id), qty: 10, discountPct: 50 }] });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.items[0].discountPct, 0, 'partners cannot self-discount');
    assert.equal(res.body.grandTotal, 10 * 540 * 1.18);
    orderId = res.body._id;
  });

  test('order lifecycle -> invoice -> stock in', async () => {
    const before = await as('partner').get('/api/stock');
    const p = await Product.findOne({ sku: 'AHCL-PST-01' });
    const closing = (r) => r.body.items.find((i) => String(i.productId) === String(p._id))?.closing ?? 0;
    const c0 = closing(before);
    const bad = await as('partner').post(`/api/orders/${orderId}/status`, { status: 'shipped' });
    assert.equal(bad.status, 403);
    for (const status of ['packed', 'shipped', 'delivered']) {
      const r = await as('admin').post(`/api/orders/${orderId}/status`, { status });
      assert.equal(r.status, 200, JSON.stringify(r.body));
    }
    const after_ = await as('partner').get('/api/stock');
    assert.equal(closing(after_), c0 + 10);
    const inv = await as('partner').get('/api/invoices');
    const invoice = inv.body.items.find((i) => String(i.order?._id) === orderId);
    assert.ok(invoice, 'invoice generated');
    assert.equal(invoice.cgstTotal, invoice.sgstTotal);
    const pdf = await as('partner').get(`/api/invoices/${invoice._id}/pdf`);
    assert.equal(pdf.headers['content-type'], 'application/pdf');
  });

  test('stock adjustment, reorder suggestions, insufficient stock', async () => {
    const p = await Product.findOne({ sku: 'AHCL-SED-01' });
    const adj = await as('partner').post('/api/stock/txns', { product: String(p._id), type: 'adjustment', delta: -1, reason: 'Damaged' });
    assert.equal(adj.status, 201, JSON.stringify(adj.body));
    const tooMuch = await as('partner').post('/api/stock/txns', { product: String(p._id), type: 'out', qty: 100000 });
    assert.equal(tooMuch.status, 400);
    const sug = await as('partner').get('/api/stock/reorder-suggestions');
    assert.equal(sug.status, 200);
  });

  test('retailer onboarding + claims', async () => {
    const r = await as('partner').post('/api/retailers', { name: 'New Retailer', contact: { mobile: '9876543210' }, location: { lat: 20.3, lng: 85.8 }, kyc: { pan: 'ABCDE1234F' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.distributorCode, 'DS-OD-101');
    const list = await as('partner').get('/api/retailers?q=new');
    assert.equal(list.body.total, 1);
    const c = await as('partner').post('/api/claims', { type: 'scheme', schemeName: 'Kharif Bonanza', amount: 5000 });
    assert.equal(c.status, 201);
    const rv = await as('admin').post(`/api/claims/${c.body._id}/review`, { status: 'approved', approvedAmount: 4500 });
    assert.equal(rv.body.approvedAmount, 4500);
  });

  test('partner cannot see another distributor', async () => {
    const other = await Distributor.findOne({ code: 'ST-OD-201' });
    const res = await as('partner').get(`/api/stock?distributor=${other._id}`);
    assert.equal(res.status, 403);
  });

  test('dashboards', async () => {
    const pd = await as('partner').get('/api/analytics/dashboard');
    assert.equal(pd.body.panel, 'partner');
    const ac = await as('admin').get('/api/analytics/charts');
    assert.equal(ac.status, 200);
    assert.equal(ac.body.orderValueByMonth.length, 6);
  });
});
