import mongoose from 'mongoose';
import { env } from './env.js';

let memoryServer;

export async function connectDb() {
  let uri = env.mongoUri;
  if (!uri) {
    if (env.isProd) throw new Error('MONGO_URI is required in production');
    // Dev convenience: spin up a throwaway MongoDB so the API runs with zero setup.
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri('ahcl360');
    console.warn('[db] MONGO_URI not set - using in-memory MongoDB (data is lost on restart)');
  }
  await mongoose.connect(uri);
  console.log('[db] connected');
  return { inMemory: Boolean(memoryServer) };
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}
