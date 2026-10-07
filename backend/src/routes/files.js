import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { isAdmin } from '../config/roles.js';
import { Distributor, File, User } from '../models/index.js';
import { decryptBuffer, encryptBuffer } from '../utils/crypto.js';
import { badRequest, forbidden, notFound } from '../utils/http.js';

const r = Router();
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 10 },
  fileFilter: (_req, f, cb) => cb(ALLOWED.includes(f.mimetype) ? null : badRequest(`Unsupported file type: ${f.mimetype}`), ALLOWED.includes(f.mimetype)),
});

const dir = path.resolve(env.uploadDir);
await fs.mkdir(dir, { recursive: true });

/** Save uploaded files encrypted at rest; returns File docs. */
export async function storeFiles(user, files, purpose = 'other') {
  return Promise.all(
    files.map(async (f) => {
      const storageName = `${crypto.randomUUID()}.bin`;
      await fs.writeFile(path.join(dir, storageName), encryptBuffer(f.buffer));
      return File.create({ owner: user._id, distributor: user.distributor, storageName, originalName: f.originalname, mimeType: f.mimetype, size: f.size, purpose });
    }),
  );
}

const toDto = (f) => ({ id: f._id, name: f.originalName, mimeType: f.mimeType, size: f.size, purpose: f.purpose, url: `/api/files/${f._id}` });

/** POST /api/files  (multipart, field "files", optional "purpose") */
r.post('/', upload.array('files', 10), async (req, res) => {
  if (!req.files?.length) throw badRequest('No files uploaded (field name: files)');
  const docs = await storeFiles(req.user, req.files, req.body.purpose);
  res.status(201).json({ files: docs.map(toDto) });
});

async function canRead(user, file) {
  if (String(file.owner) === String(user._id) || isAdmin(user)) return true;
  if (user.distributor && file.distributor && String(user.distributor) === String(file.distributor)) return true;
  if (user.role === 'manager') return (await User.subordinateIds(user._id)).some((id) => String(id) === String(file.owner));
  // Field staff can see files of partners they handle (e.g. retailer KYC) - checked via distributor assignment.
  if (user.userType === 'employee' && file.distributor) {
    return Boolean(await Distributor.exists({ _id: file.distributor, assignedEmployees: user._id }));
  }
  return false;
}

r.get('/:id', async (req, res) => {
  const file = await File.findById(req.params.id);
  if (!file) throw notFound('File not found');
  if (!(await canRead(req.user, file))) throw forbidden();
  const data = decryptBuffer(await fs.readFile(path.join(dir, file.storageName)));
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(file.originalName || 'file')}"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(data);
});

r.delete('/:id', async (req, res) => {
  const file = await File.findById(req.params.id);
  if (!file) throw notFound('File not found');
  if (String(file.owner) !== String(req.user._id) && !isAdmin(req.user)) throw forbidden();
  await fs.rm(path.join(dir, file.storageName), { force: true });
  await file.deleteOne();
  res.json({ ok: true });
});

export default r;
