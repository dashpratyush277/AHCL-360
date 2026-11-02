/**
 * Database backup / restore (works on MongoDB Atlas free tier, which has no automatic backups).
 *
 *   npm run backup                              -> backups/ahcl360-<timestamp>/   (uses MONGO_URI)
 *   npm run restore -- --from backups/ahcl360-20261102-1400 --uri <staging MONGO_URI> [--drop]
 *
 * Every collection is exported as gzipped Extended JSON, so types (ObjectId, Date, Binary) survive.
 * Encrypted fields and uploaded files are copied as-is: they stay encrypted in the backup and are
 * readable after restore only with the same ENCRYPTION_KEY. Keep backups as secret as the database.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { EJSON } from 'bson';

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');

export async function backupDb(db, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = { createdAt: new Date().toISOString(), database: db.databaseName, collections: {} };
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (name.startsWith('system.')) continue;
    const gz = zlib.createGzip();
    const out = fs.createWriteStream(path.join(outDir, `${name}.jsonl.gz`));
    gz.pipe(out);
    let n = 0;
    for await (const doc of db.collection(name).find()) {
      gz.write(`${EJSON.stringify(doc, { relaxed: false })}\n`);
      n += 1;
    }
    gz.end();
    await new Promise((resolve, reject) => out.on('finish', resolve).on('error', reject));
    const indexes = await db.collection(name).indexes();
    manifest.collections[name] = { documents: n, indexes: indexes.filter((i) => i.name !== '_id_') };
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

export async function restoreDb(db, fromDir, { drop = false } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(fromDir, 'manifest.json'), 'utf8'));
  const existing = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
  const clash = Object.keys(manifest.collections).filter((c) => existing.includes(c));
  if (clash.length && !drop) throw new Error(`Target already has data (${clash.slice(0, 5).join(', ')}…). Use --drop to replace it.`);
  const restored = {};
  for (const [name, meta] of Object.entries(manifest.collections)) {
    if (drop && existing.includes(name)) await db.collection(name).drop();
    const lines = zlib.gunzipSync(fs.readFileSync(path.join(fromDir, `${name}.jsonl.gz`))).toString('utf8').split('\n').filter(Boolean);
    const docs = lines.map((l) => EJSON.parse(l, { relaxed: false }));
    for (let i = 0; i < docs.length; i += 1000) await db.collection(name).insertMany(docs.slice(i, i + 1000), { ordered: false });
    for (const ix of meta.indexes) {
      const { key, name: ixName, v: _v, ns: _ns, ...opts } = ix;
      await db.collection(name).createIndex(key, { name: ixName, ...opts }).catch(() => {});
    }
    restored[name] = docs.length;
    if (docs.length !== meta.documents) throw new Error(`${name}: expected ${meta.documents} documents, restored ${docs.length}`);
  }
  return { manifest, restored };
}

// ---------------- CLI ----------------
const isCli = process.argv[1]?.replace(/\\/g, '/').endsWith('src/scripts/backup.js');
if (isCli) {
  const { parseArgs } = await import('node:util');
  const mongoose = (await import('mongoose')).default;
  const { values } = parseArgs({ options: { restore: { type: 'boolean' }, from: { type: 'string' }, uri: { type: 'string' }, out: { type: 'string' }, drop: { type: 'boolean' } } });
  const { env } = await import('../config/env.js');
  const uri = values.uri || env.mongoUri;
  if (!uri) {
    console.error('Set MONGO_URI (or pass --uri).');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (values.restore) {
    if (!values.from) throw new Error('--from <backup folder> is required');
    const { restored } = await restoreDb(db, values.from, { drop: values.drop });
    console.log('Restored:', restored);
  } else {
    const dir = values.out || path.join('backups', `${db.databaseName}-${stamp()}`);
    const m = await backupDb(db, dir);
    console.log(`Backup written to ${dir}`);
    console.table(Object.fromEntries(Object.entries(m.collections).map(([k, v]) => [k, v.documents])));
  }
  await mongoose.disconnect();
}
