import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import adminRoutes from './routes/admin.js';
import analyticsRoutes from './routes/analytics.js';
import attendanceRoutes from './routes/attendance.js';
import authRoutes from './routes/auth.js';
import commonRoutes from './routes/common.js';
import expenseRoutes from './routes/expenses.js';
import fileRoutes from './routes/files.js';
import hrRoutes from './routes/hr.js';
import partnerRoutes from './routes/partner.js';
import reportRoutes from './routes/reports.js';
import salesRoutes from './routes/sales.js';
import syncRoutes from './routes/sync.js';
import teamRoutes from './routes/team.js';
import trackingRoutes from './routes/tracking.js';
import visitRoutes from './routes/visits.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // admin panel: OpenStreetMap tiles + blob: previews of downloaded PDFs/images
          'img-src': ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
          'frame-src': ["'self'", 'blob:'],
        },
      },
    }),
  );
  app.use(cors({ origin: env.corsOrigins.includes('*') ? true : env.corsOrigins }));
  app.use(express.json({ limit: '2mb' }));
  if (env.nodeEnv !== 'test') app.use(morgan(env.isProd ? 'combined' : 'dev'));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use('/api/auth', authRoutes);

  // Everything below requires a valid access token.
  const api = express.Router();
  api.use(authenticate);
  api.use('/files', fileRoutes);
  api.use('/attendance', attendanceRoutes);
  api.use('/tracking', trackingRoutes);
  api.use('/visits', visitRoutes);
  api.use('/hr', hrRoutes);
  api.use('/expenses', expenseRoutes);
  api.use('/team', teamRoutes);
  api.use('/reports', reportRoutes);
  api.use('/sync', syncRoutes);
  api.use('/analytics', analyticsRoutes);
  api.use('/admin', adminRoutes);
  api.use('/', salesRoutes); // /products /distributors /stock /dso /targets
  api.use('/', partnerRoutes); // /orders /invoices /retailers /claims
  api.use('/', commonRoutes); // /profile /notifications /support
  app.use('/api', api);

  // Optional: serve the built admin panel (admin/dist) on the same domain as the API.
  if (env.adminDir && fs.existsSync(path.join(env.adminDir, 'index.html'))) {
    const dir = path.resolve(env.adminDir);
    app.use(express.static(dir, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api(\/|$)).*/, (_req, res) => res.sendFile(path.join(dir, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
