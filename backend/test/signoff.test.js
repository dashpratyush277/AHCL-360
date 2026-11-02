// QA sign-off cases from the AHCL "First-Cut Technical Review" (section 11, T01–T11),
// plus the P0 security items. Each test name starts with the review's test ID.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = '';
process.env.DISABLE_JOBS = 'true';
process.env.ADMIN_MFA = 'true';
process.env.OTP_RESEND_SECONDS = '0';
process.env.UPLOAD_STORAGE = 'mongo';

const { connectDb, disconnectDb } = await import('../src/config/db.js');
const { createApp } = await import('../src/app.js');
const { seed } = await import('../src/seed.js');
const mongoose = (await import('mongoose')).default;
const { CreditNote, Distributor, Expense, Invoice, Order, Otp, Product, StockTxn, User, Visit } = await import('../src/models/index.js');
const { FileBlob } = await import('../src/models/File.js');
const { backupDb, restoreDb } = await import('../src/scripts/backup.js');
const { decryptBuffer } = await import('../src/utils/crypto.js');

let app;
const tok = {};
const PW = 'Password@123';

async function login(mobile, panel = 'employee', password = PW) {
  return request(app).post('/api/auth/login').send({ identifier: mobile, password, panel });
}
const as = (who) => ({
  get: (u) => request(app).get(u).set('Authorization', `Bearer ${tok[who]}`),
  post: (u, b) => request(app).post(u).set('Authorization', `Bearer ${tok[who]}`).send(b),
});

before(async () => {
  await connectDb();
  await seed();
  app = createApp();
  for (const [k, m, p] of [['admin', '9000000001', 'employee'], ['hr', '9000000005', 'employee'], ['manager', '9000000002', 'employee'], ['fe', '9000000003', 'employee'], ['fe2', '9000000004', 'employee'], ['distA', '9100000002', 'partner'], ['stockistB', '9100000003', 'partner'], ['superDist', '9100000001', 'partner']]) {
    const r = await login(m, p);
    assert.equal(r.status, 200, `${k}: ${JSON.stringify(r.body)}`);
    tok[k] = r.body.accessToken;
  }
});
after(disconnectDb);

describe('T01 authentication', () => {
  test('T01 wrong / expired OTP rejected, unknown number gets the same reply', async () => {
    const unknown = await request(app).post('/api/auth/otp/request').send({ identifier: '9999999999', panel: 'employee' });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.body.sent, true);

    const r = await request(app).post('/api/auth/otp/request').send({ identifier: '9000000004', panel: 'employee' });
    const wrong = await request(app).post('/api/auth/otp/verify').send({ identifier: '9000000004', code: r.body.devCode === '000000' ? '111111' : '000000', panel: 'employee' });
    assert.equal(wrong.status, 401);
    const u = await User.findOne({ mobile: '9000000004' });
    await Otp.updateOne({ identifier: String(u._id) }, { expiresAt: new Date(Date.now() - 1000) });
    const expired = await request(app).post('/api/auth/otp/verify').send({ identifier: '9000000004', code: r.body.devCode, panel: 'employee' });
    assert.equal(expired.status, 401);
    assert.match(expired.body.error, /expired/i);
  });

  test('T01 logout revokes the session', async () => {
    const s = await login('9000000004');
    await request(app).post('/api/auth/logout').send({ refreshToken: s.body.refreshToken });
    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: s.body.refreshToken });
    assert.equal(reuse.status, 401);
  });

  test('P0 account locks after repeated wrong passwords', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await login('9000000004', 'employee', 'wrong-pass-1')).status, 401);
    const locked = await login('9000000004');
    assert.equal(locked.status, 429, 'even the right password is refused while locked');
    await User.updateOne({ mobile: '9000000004' }, { $unset: { lockedUntil: 1 }, failedLogins: 0 });
  });

  test('P0 forgotten password reset by OTP signs out other sessions', async () => {
    const old = await login('9000000004');
    const otp = await request(app).post('/api/auth/otp/request').send({ identifier: '9000000004', panel: 'employee' });
    const reset = await request(app).post('/api/auth/password/reset').send({ identifier: '9000000004', code: otp.body.devCode, newPassword: 'NewSecret99', panel: 'employee' });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));
    assert.equal((await login('9000000004', 'employee', 'NewSecret99')).status, 200);
    assert.equal((await login('9000000004')).status, 401, 'old password no longer works');
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${old.body.accessToken}`);
    assert.equal(me.status, 401, 'session from before the reset is revoked');
  });

  test('P0 admin panel requires password + OTP (MFA)', async () => {
    const step1 = await login('9000000001', 'admin');
    assert.equal(step1.status, 200);
    assert.equal(step1.body.mfaRequired, true);
    assert.equal(step1.body.accessToken, undefined, 'no session before the second factor');
    const otpOnly = await request(app).post('/api/auth/otp/request').send({ identifier: '9000000001', panel: 'admin' });
    assert.equal(otpOnly.status, 400, 'OTP alone is not enough for the admin panel');
    const bad = await request(app).post('/api/auth/mfa/verify').send({ mfaToken: step1.body.mfaToken, code: step1.body.devCode === '000000' ? '111111' : '000000' });
    assert.equal(bad.status, 401);
    const step1b = await login('9000000001', 'admin');
    const ok = await request(app).post('/api/auth/mfa/verify').send({ mfaToken: step1b.body.mfaToken, code: step1b.body.devCode });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.ok(ok.body.accessToken);
  });
});

describe('T02 tenant isolation', () => {
  test('T02 partner B cannot read partner A order, invoice, claim or file (404, not 403)', async () => {
    const p = await Product.findOne({ sku: 'AHCL-PST-01' });
    const order = await as('distA').post('/api/orders', { items: [{ product: String(p._id), qty: 2 }] });
    await as('admin').post(`/api/orders/${order.body._id}/status`, { status: 'packed' });
    const inv = await Invoice.findOne({ order: order.body._id });
    const claim = await as('distA').post('/api/claims', { type: 'scheme', amount: 100 });
    const file = await request(app).post('/api/files').set('Authorization', `Bearer ${tok.distA}`).attach('files', Buffer.from('%PDF-1.4 A only'), { filename: 'a.pdf', contentType: 'application/pdf' });

    for (const url of [`/api/orders/${order.body._id}`, `/api/invoices/${inv._id}/pdf`, `/api/claims/${claim.body._id}`, `/api/files/${file.body.files[0].id}`]) {
      const r = await as('stockistB').get(url);
      assert.equal(r.status, 404, `${url} -> ${r.status}`);
    }
    const cancel = await as('stockistB').post(`/api/orders/${order.body._id}/status`, { status: 'cancelled' });
    assert.equal(cancel.status, 404);
    // the parent super distributor is allowed to see its child's order
    assert.equal((await as('superDist').get(`/api/orders/${order.body._id}`)).status, 200);
  });

  test('T02 server ignores client-supplied prices and discounts', async () => {
    const p = await Product.findOne({ sku: 'AHCL-FRT-02' });
    const r = await as('distA').post('/api/orders', { items: [{ product: String(p._id), qty: 3, discountPct: 90, price: 1 }], grandTotal: 1 });
    assert.equal(r.status, 201);
    assert.equal(r.body.items[0].price, p.price);
    assert.equal(r.body.items[0].discountPct, 0);
  });
});

describe('T03 location policy', () => {
  test('T03 mock (fake GPS) locations are flagged on attendance and visits', async () => {
    tok.fe2 = (await login('9000000004', 'employee', 'NewSecret99')).body.accessToken; // password was reset in T01
    const v = await as('fe2').post('/api/visits', { clientName: 'Spoof Test', purpose: 'Demo', lat: 20.3, lng: 85.82, mocked: true });
    assert.equal(v.status, 201);
    assert.equal(v.body.locationValid, false);
    assert.match(v.body.locationRemark, /mock/i);
    await as('fe2').post(`/api/visits/${v.body._id}/check-out`, { lat: 20.3, lng: 85.82 });
  });

  test('T03 GPS points outside office hours are not stored', async () => {
    await User.updateOne({ mobile: '9000000004' }, { 'officeHours.start': '00:00', 'officeHours.end': '00:01', 'officeHours.workingDays': ['Mon'] });
    const fresh = await login('9000000004', 'employee', 'NewSecret99');
    const r = await request(app).post('/api/tracking/pings').set('Authorization', `Bearer ${fresh.body.accessToken}`).send({ points: [{ lat: 20.3, lng: 85.8, recordedAt: '2026-11-03T12:00:00+05:30' }] }); // a Tuesday afternoon
    assert.equal(r.body.accepted, 0);
    assert.equal(r.body.trackingActive, false);
  });
});

describe('T04 offline sync', () => {
  test('T04 the same offline op uploaded twice at the same time creates exactly one record', async () => {
    const op = { clientId: 'signoff-dup-visit-01', type: 'visit.create', payload: { clientName: 'Twice Shop', purpose: 'Sync', lat: 20.3, lng: 85.82, time: new Date().toISOString() } };
    const [a, b] = await Promise.all([as('manager').post('/api/sync', { ops: [op] }), as('manager').post('/api/sync', { ops: [op] })]);
    const statuses = [a.body.results[0].status, b.body.results[0].status].sort();
    assert.ok(statuses.includes('ok'), JSON.stringify(statuses));
    assert.equal(await Visit.countDocuments({ clientId: op.clientId }), 1);
    const later = await as('manager').post('/api/sync', { ops: [op] });
    assert.equal(later.body.results[0].status, 'duplicate');
  });
});

describe('T05 concurrency', () => {
  test('T05 two simultaneous stock-outs for the last unit: one succeeds, stock never negative', async () => {
    const d = await Distributor.findOne({ code: 'DS-OD-101' });
    const p = await Product.findOne({ sku: 'AHCL-SED-02' });
    const stock = await as('distA').get('/api/stock');
    const closing = stock.body.items.find((i) => String(i.productId) === String(p._id)).closing;
    if (closing > 1) assert.equal((await as('distA').post('/api/stock/txns', { product: String(p._id), type: 'out', qty: closing - 1 })).status, 201);
    const [x, y] = await Promise.all([1, 2].map(() => as('distA').post('/api/stock/txns', { product: String(p._id), type: 'out', qty: 1 })));
    assert.deepEqual([x.status, y.status].sort(), [201, 400]);
    const ledger = await StockTxn.aggregate([{ $match: { distributor: d._id, product: p._id } }, { $group: { _id: null, q: { $sum: '$delta' } } }]);
    assert.equal(ledger[0].q, 0);
  });

  test('T05 two simultaneous "packed" clicks create one invoice', async () => {
    const p = await Product.findOne({ sku: 'AHCL-PST-02' });
    const order = await as('distA').post('/api/orders', { items: [{ product: String(p._id), qty: 4 }] });
    const res = await Promise.all([1, 2].map(() => as('admin').post(`/api/orders/${order.body._id}/status`, { status: 'packed' })));
    assert.deepEqual(res.map((r) => r.status).sort(), [200, 409]);
    assert.equal(await Invoice.countDocuments({ order: order.body._id }), 1);
  });
});

describe('T06 order lifecycle with return', () => {
  test('T06 processing -> packed -> shipped -> delivered -> return issues a GST credit note and moves stock', async () => {
    const p = await Product.findOne({ sku: 'AHCL-MCR-01' });
    const order = await as('distA').post('/api/orders', { items: [{ product: String(p._id), qty: 10 }] });
    for (const s of ['packed', 'shipped', 'delivered']) assert.equal((await as('admin').post(`/api/orders/${order.body._id}/status`, { status: s })).status, 200);
    const before = (await as('distA').get('/api/stock')).body.items.find((i) => String(i.productId) === String(p._id)).closing;

    const tooMany = await as('admin').post(`/api/orders/${order.body._id}/returns`, { items: [{ product: String(p._id), qty: 11 }], reason: 'Damaged in transit' });
    assert.equal(tooMany.status, 400);
    const ret = await as('admin').post(`/api/orders/${order.body._id}/returns`, { items: [{ product: String(p._id), qty: 3 }], reason: 'Damaged in transit' });
    assert.equal(ret.status, 201, JSON.stringify(ret.body));
    assert.equal(ret.body.order.status, 'partially_returned');
    const cn = ret.body.creditNote;
    assert.match(cn.creditNoteNo, /^CN\//);
    const inv = await Invoice.findOne({ order: order.body._id });
    assert.equal(cn.invoiceNo, inv.invoiceNo);
    assert.equal(cn.taxableTotal, Math.round(inv.taxableTotal * 100 * 3 / 10) / 100, 'credited at the invoiced value per unit');
    const after_ = (await as('distA').get('/api/stock')).body.items.find((i) => String(i.productId) === String(p._id)).closing;
    assert.equal(after_, before - 3);
    assert.equal((await as('distA').get(`/api/credit-notes/${cn._id}/pdf`)).headers['content-type'], 'application/pdf');
    assert.equal((await as('stockistB').get(`/api/credit-notes/${cn._id}/pdf`)).status, 404);
    // a manual status change after delivery is not allowed (returns only)
    assert.equal((await as('admin').post(`/api/orders/${order.body._id}/status`, { status: 'cancelled' })).status, 400);
    assert.equal(await CreditNote.countDocuments({ order: order.body._id }), 1);
  });

  test('T08 invoice arithmetic is exact (paise): taxable + tax + round-off = total', async () => {
    for (const inv of await Invoice.find().lean()) {
      const paise = (x) => Math.round(x * 100);
      assert.equal(paise(inv.taxableTotal) + paise(inv.cgstTotal) + paise(inv.sgstTotal) + paise(inv.igstTotal) + paise(inv.roundOff), paise(inv.grandTotal), inv.invoiceNo);
      assert.equal(inv.grandTotal % 1, 0, 'invoice value rounded to the rupee');
      for (const it of inv.items) assert.equal(paise(it.taxable) + paise(it.cgst) + paise(it.sgst) + paise(it.igst), paise(it.total));
    }
  });
});

describe('T07 approvals', () => {
  test('T07 no self-approval – not even for admins; status history is kept', async () => {
    const mine = await as('manager').post('/api/expenses', { date: '2026-11-01', category: 'food', amount: 220, description: 'Team lunch' });
    assert.equal(mine.status, 201);
    assert.equal((await as('manager').post(`/api/expenses/${mine.body._id}/review`, { status: 'approved' })).status, 403);

    const adminOwn = await as('admin').post('/api/expenses', { date: '2026-11-01', category: 'food', amount: 150 });
    assert.equal((await as('admin').post(`/api/expenses/${adminOwn.body._id}/review`, { status: 'approved' })).status, 403);

    // the manager's own claim is approved by their manager (super admin) and reimbursed by HR
    assert.equal((await as('admin').post(`/api/expenses/${mine.body._id}/review`, { status: 'approved', comment: 'ok' })).status, 200);
    assert.equal((await as('hr').post(`/api/expenses/${mine.body._id}/reimburse`, { reference: 'NEFT-778' })).status, 200);
    const exp = await Expense.findById(mine.body._id).lean();
    assert.deepEqual(exp.history.map((h) => h.status), ['pending', 'approved', 'reimbursed']);
  });

  test('T07 a manager cannot approve their own leave', async () => {
    const l = await as('manager').post('/api/hr/leaves', { type: 'casual', from: '2031-02-02', to: '2031-02-02', reason: 'Personal work' });
    assert.equal(l.status, 201);
    assert.equal((await as('manager').post(`/api/hr/leaves/${l.body._id}/review`, { status: 'approved' })).status, 403);
  });
});

describe('P0 secure documents', () => {
  test('uploads are checked by content, not by the declared type', async () => {
    const exe = Buffer.from('MZ\x90\x00 fake executable');
    const r = await request(app).post('/api/files').set('Authorization', `Bearer ${tok.fe}`).attach('files', exe, { filename: 'bill.pdf', contentType: 'application/pdf' });
    assert.equal(r.status, 400);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const ok = await request(app).post('/api/files').set('Authorization', `Bearer ${tok.fe}`).attach('files', png, { filename: 'photo.jpg', contentType: 'image/jpeg' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.files[0].mimeType, 'image/png', 'type corrected from the file content');
  });
});

describe('T10 backup and restore', () => {
  test('T10 backup restores into another database with identical data and readable encrypted files', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahcl-backup-'));
    const src = mongoose.connection.db;
    const manifest = await backupDb(src, dir);
    const target = mongoose.connection.client.db('ahcl360_restore_drill');
    const { restored } = await restoreDb(target, dir);
    for (const [name, meta] of Object.entries(manifest.collections)) assert.equal(restored[name], meta.documents, name);
    assert.equal(await target.collection('users').countDocuments(), await User.countDocuments());

    const blob = await FileBlob.findOne().lean();
    const copy = await target.collection('fileblobs').findOne({ _id: blob._id });
    assert.deepEqual(decryptBuffer(Buffer.from(copy.data.buffer)), decryptBuffer(Buffer.from(blob.data.buffer)));
    const kycUser = await target.collection('users').findOne({ 'kyc.aadhaar': { $exists: true } });
    if (kycUser) assert.match(kycUser.kyc.aadhaar, /^enc:v1:/, 'identity numbers stay encrypted in the backup');

    await assert.rejects(restoreDb(target, dir), /already has data/);
    await target.dropDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('T11 blocked user', () => {
  test('T11 blocking ends an active session immediately', async () => {
    const u = await User.findOne({ mobile: '9000000003' });
    const live = await login('9000000003');
    await as('admin').post(`/api/admin/users/${u._id}/block`, { blocked: true, reason: 'test' });
    assert.equal((await request(app).get('/api/visits').set('Authorization', `Bearer ${live.body.accessToken}`)).status, 403);
    assert.equal((await request(app).post('/api/auth/refresh').send({ refreshToken: live.body.refreshToken })).status, 401);
    await as('admin').post(`/api/admin/users/${u._id}/block`, { blocked: false });
  });
});
