import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { env } from './config/env.js';
import { startJobs } from './services/jobs.js';

const { inMemory } = await connectDb();
if (inMemory) {
  // Fresh in-memory DB: load demo data so the apps have something to show.
  const { seed } = await import('./seed.js');
  await seed();
}

const server = createApp().listen(env.port, () => console.log(`[api] AHCL 360 API listening on http://localhost:${env.port}/api`));
startJobs();

const shutdown = async () => {
  server.close();
  await disconnectDb();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
