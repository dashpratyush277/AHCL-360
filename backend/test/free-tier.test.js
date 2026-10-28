// Runs the API the way the Render free-tier blueprint configures it.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = '';
process.env.DISABLE_JOBS = 'true';
process.env.UPLOAD_STORAGE = 'mongo';
process.env.ENCRYPTION_KEY = 'render-style-generated-secret-QWxhZGRpbjpvcGVuIHNlc2FtZQ'; // not hex

const { connectDb, disconnectDb } = await import('../src/config/db.js');
const { createApp } = await import('../src/app.js');
const { seed } = await import('../src/seed.js');
const { FileBlob } = await import('../src/models/File.js');

let app;
let token;
before(async () => {
  await connectDb();
  await seed();
  app = createApp();
  const r = await request(app).post('/api/auth/login').send({ identifier: '9000000003', password: 'Password@123', panel: 'employee' });
  token = r.body.accessToken;
});
after(disconnectDb);

test('uploads are stored encrypted in MongoDB and read back intact', async () => {
  const pdf = Buffer.from('%PDF-1.4 travel bill 450 INR');
  const up = await request(app).post('/api/files').set('Authorization', `Bearer ${token}`).field('purpose', 'bill').attach('files', pdf, { filename: 'bill.pdf', contentType: 'application/pdf' });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const id = up.body.files[0].id;

  const blobs = await FileBlob.find().lean();
  assert.equal(blobs.length, 1, 'bytes went to MongoDB, not disk');
  assert.ok(!Buffer.from(blobs[0].data.buffer ?? blobs[0].data).includes('travel bill'), 'stored bytes are encrypted');

  const back = await request(app).get(`/api/files/${id}`).set('Authorization', `Bearer ${token}`).buffer(true).parse((res, cb) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  assert.equal(back.status, 200);
  assert.deepEqual(back.body, pdf);

  const del = await request(app).delete(`/api/files/${id}`).set('Authorization', `Bearer ${token}`);
  assert.equal(del.status, 200);
  assert.equal(await FileBlob.countDocuments(), 0);
});

test('KYC field encryption works with a non-hex generated key', async () => {
  const r = await request(app).post('/api/hr/kyc').set('Authorization', `Bearer ${token}`).send({ aadhaar: '123412341234' });
  assert.equal(r.status, 200);
  assert.equal(r.body.kyc.aadhaar, '********1234');
});
