import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { FileBlob } from '../models/File.js';
import { decryptBuffer, encryptBuffer } from '../utils/crypto.js';

/**
 * Where uploaded files live. Bytes are always AES-256-GCM encrypted first.
 *  - disk  : UPLOAD_DIR on a persistent volume (own server, paid hosting with a disk)
 *  - mongo : inside MongoDB (free hosting tiers have no persistent disk)
 */
const dir = path.resolve(env.uploadDir);

const drivers = {
  disk: {
    async init() {
      await fs.mkdir(dir, { recursive: true });
    },
    put: (name, bytes) => fs.writeFile(path.join(dir, name), bytes),
    get: (name) => fs.readFile(path.join(dir, name)),
    remove: (name) => fs.rm(path.join(dir, name), { force: true }),
  },
  mongo: {
    async init() {},
    put: (name, bytes) => FileBlob.create({ _id: name, data: bytes }),
    async get(name) {
      const blob = await FileBlob.findById(name).lean();
      if (!blob) throw Object.assign(new Error('File content missing'), { status: 404 });
      return Buffer.from(blob.data.buffer ?? blob.data);
    },
    remove: (name) => FileBlob.deleteOne({ _id: name }),
  },
};

const driver = drivers[env.uploadStorage];
if (!driver) throw new Error(`UPLOAD_STORAGE must be "disk" or "mongo" (got "${env.uploadStorage}")`);
await driver.init();

export const putFile = (name, plain) => driver.put(name, encryptBuffer(plain));
export const getFile = async (name) => decryptBuffer(await driver.get(name));
export const removeFile = (name) => driver.remove(name);
