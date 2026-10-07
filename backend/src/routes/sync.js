import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { SyncOp } from '../models/index.js';
import { checkIn, checkOut } from './attendance.js';
import { createExpense, expenseSchema } from './expenses.js';
import { createDso, createStockTxn } from './sales.js';
import { submitWorkReport, workReportSchema } from './team.js';
import { savePings } from './tracking.js';
import { checkOutVisit, createVisit, visitSchema } from './visits.js';

/**
 * Offline sync. The app queues operations while offline and posts them here in order.
 * Each op has a client-generated id; replays return the stored result (idempotent).
 */
const r = Router();

const employeeOnly = (fn) => (req, payload) => {
  if (req.user.userType !== 'employee') throw Object.assign(new Error('Not allowed for partner accounts'), { status: 403 });
  return fn(req, payload);
};
const withTime = (p) => ({ ...p, time: p.time ? new Date(p.time) : undefined });

const handlers = {
  'attendance.checkIn': employeeOnly((req, p) => checkIn(req.user, withTime(p))),
  'attendance.checkOut': employeeOnly((req, p) => checkOut(req.user, withTime(p))),
  'tracking.pings': employeeOnly((req, p) => savePings(req.user, p.points.map((x) => ({ ...x, recordedAt: new Date(x.recordedAt) })))),
  'visit.create': employeeOnly((req, p) => createVisit(req.user, visitSchema.parse(p))),
  'visit.checkOut': employeeOnly((req, p) => checkOutVisit(req.user, p.visitId, withTime(p))),
  'expense.create': employeeOnly((req, p) => createExpense(req.user, expenseSchema.parse(p))),
  'dso.create': employeeOnly((req, p) => createDso(req.user, p)),
  'workReport.submit': employeeOnly((req, p) => submitWorkReport(req.user, workReportSchema.parse(p))),
  'stock.txn': (req, p) => createStockTxn(req, { ...p, date: p.date ? new Date(p.date) : undefined }),
};

const opsSchema = z.object({
  ops: z
    .array(z.object({ clientId: z.string().min(8), type: z.enum(Object.keys(handlers)), payload: z.record(z.string(), z.any()), createdAt: z.string().optional() }))
    .max(200),
});

r.post('/', validate(opsSchema), async (req, res) => {
  const results = [];
  for (const op of req.valid.body.ops) {
    const done = await SyncOp.findOne({ user: req.user._id, clientId: op.clientId }).lean();
    if (done) {
      results.push({ clientId: op.clientId, status: 'duplicate', result: done.result });
      continue;
    }
    try {
      const out = await handlers[op.type](req, { ...op.payload, clientId: op.payload.clientId || op.clientId });
      const result = out?._id ? { id: String(out._id) } : out;
      await SyncOp.create({ user: req.user._id, clientId: op.clientId, op: op.type, result });
      results.push({ clientId: op.clientId, status: 'ok', result });
    } catch (err) {
      // 4xx errors are permanent (app should drop/show them); others can be retried.
      const status = err.status || (err.name === 'ZodError' ? 400 : 500);
      results.push({ clientId: op.clientId, status: 'error', error: err.message, retry: status >= 500 });
    }
  }
  res.json({ results, serverTime: new Date().toISOString() });
});

export default r;
