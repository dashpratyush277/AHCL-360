import { Router } from 'express';
import { z } from 'zod';
import { MANAGERS } from '../config/roles.js';
import { authorize, requireUserType } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Attendance, Expense, SalesOrder, Target, User, Visit, WorkReport } from '../models/index.js';
import { notify } from '../services/messaging.js';
import { dayDistanceKm } from '../services/tracking.js';
import { dayKey, monthKey, periodRange } from '../utils/dates.js';
import { badRequest, notFound, paged } from '../utils/http.js';
import { assertCanManage, userScopeFilter } from '../utils/scope.js';

const r = Router();
r.use(requireUserType('employee'));

/** Direct + indirect juniors with today's status. */
r.get('/juniors', authorize(MANAGERS), async (req, res) => {
  const ids = await User.subordinateIds(req.user._id);
  const users = await User.find({ _id: { $in: ids } }).select('name employeeCode role mobile manager profile.designation isBlocked').populate('manager', 'name').lean();
  const today = dayKey();
  const att = await Attendance.find({ user: { $in: ids }, date: today }).select('user checkIn checkOut status').lean();
  const am = new Map(att.map((a) => [String(a.user), a]));
  res.json({ items: users.map((u) => ({ ...u, today: am.get(String(u._id)) || null })) });
});

/* ------------------------------ Daily work reports ------------------------------ */

export async function submitWorkReport(user, b) {
  const date = b.date || dayKey();
  const [visits, sales, distanceKm] = await Promise.all([
    Visit.countDocuments({ user: user._id, date }),
    SalesOrder.aggregate([{ $match: { user: user._id, date } }, { $group: { _id: null, t: { $sum: '$total' } } }]),
    dayDistanceKm(user._id, date),
  ]);
  const existing = await WorkReport.findOne({ user: user._id, date });
  if (existing && existing.status === 'approved') throw badRequest('Report already approved for this date');
  const doc = await WorkReport.findOneAndUpdate(
    { user: user._id, date },
    { ...b, date, status: 'submitted', stats: { visits, distanceKm, salesValue: sales[0]?.t ?? 0 } },
    { upsert: true, returnDocument: 'after' },
  );
  if (user.manager) notify(user.manager, { title: 'Work report submitted', body: `${user.name} submitted the report for ${date}`, type: 'report', data: { id: String(doc._id) } });
  return doc;
}

export const workReportSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  summary: z.string().min(5),
  tasksCompleted: z.array(z.string()).default([]),
  plannedTomorrow: z.string().optional(),
  challenges: z.string().optional(),
  clientId: z.string().optional(),
});

r.post('/work-reports', validate(workReportSchema), async (req, res) => res.status(201).json(await submitWorkReport(req.user, req.valid.body)));

/** ?scope=mine|team&status=&date= */
r.get('/work-reports', async (req, res) => {
  const scope = req.query.scope === 'team' ? await userScopeFilter(req.user, req.query.user) : { user: req.user._id };
  if (req.query.scope === 'team' && scope.user?.$in) scope.user.$in = scope.user.$in.filter((id) => String(id) !== String(req.user._id));
  const filter = { ...scope };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.date) filter.date = req.query.date;
  res.json(await paged(WorkReport, filter, req.query, { sort: { date: -1 }, populate: [{ path: 'user', select: 'name employeeCode' }, { path: 'comments.by', select: 'name' }] }));
});

r.post(
  '/work-reports/:id/review',
  authorize(MANAGERS),
  validate(z.object({ status: z.enum(['approved', 'needs_changes']).optional(), comment: z.string().optional(), rating: z.number().int().min(1).max(5).optional() })),
  async (req, res) => {
    const rep = await WorkReport.findById(req.params.id);
    if (!rep) throw notFound();
    await assertCanManage(req.user, rep.user);
    const { status, comment, rating } = req.valid.body;
    if (comment) rep.comments.push({ by: req.user._id, text: comment });
    if (status) Object.assign(rep, { status, reviewedBy: req.user._id, reviewedAt: new Date() });
    if (rating) rep.rating = rating;
    await rep.save();
    notify(rep.user, { title: status ? `Report ${status.replace('_', ' ')}` : 'New comment on report', body: comment || `Your report for ${rep.date} was reviewed`, type: 'report', data: { id: String(rep._id) } });
    res.json(rep);
  },
);

/* ------------------------------ Performance matrix ------------------------------ */

/**
 * Per junior for a period: attendance %, visits, distance, sales vs target, report approval,
 * expenses and a weighted score (0-100).
 */
r.get('/performance', authorize(MANAGERS), async (req, res) => {
  const period = req.query.period || monthKey();
  const { start, end } = periodRange(period);
  const scope = await userScopeFilter(req.user, req.query.user);
  const ids = (scope.user?.$in || [scope.user]).filter((id) => String(id) !== String(req.user._id));
  const users = await User.find({ _id: { $in: ids }, userType: 'employee' }).select('name employeeCode role').lean();

  const elapsedDays = Math.max(1, Math.min(Math.ceil((Math.min(Date.now(), end) - start) / 86_400_000), Math.round((end - start) / 86_400_000)));
  const workingDays = Math.round(elapsedDays * (6 / 7));
  const startKey = dayKey(start);
  const endKey = dayKey(new Date(end.getTime() - 1));

  const rows = await Promise.all(
    users.map(async (u) => {
      const [present, visits, sales, target, reports, expenses] = await Promise.all([
        Attendance.countDocuments({ user: u._id, date: { $gte: startKey, $lte: endKey }, status: { $in: ['present', 'half_day'] } }),
        Visit.aggregate([{ $match: { user: u._id, 'checkIn.time': { $gte: start, $lt: end } } }, { $group: { _id: null, n: { $sum: 1 }, km: { $sum: '$distanceKm' }, invalid: { $sum: { $cond: ['$locationValid', 0, 1] } } } }]),
        SalesOrder.aggregate([{ $match: { user: u._id, createdAt: { $gte: start, $lt: end } } }, { $group: { _id: null, t: { $sum: '$total' } } }]),
        Target.findOne({ user: u._id, period }).lean(),
        WorkReport.aggregate([{ $match: { user: u._id, date: { $gte: startKey, $lte: endKey } } }, { $group: { _id: null, n: { $sum: 1 }, approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } }, rating: { $avg: '$rating' } } }]),
        Expense.aggregate([{ $match: { user: u._id, createdAt: { $gte: start, $lt: end }, status: { $ne: 'rejected' } } }, { $group: { _id: null, t: { $sum: '$amount' } } }]),
      ]);
      const v = visits[0] || { n: 0, km: 0, invalid: 0 };
      const salesAmount = sales[0]?.t ?? 0;
      const rep = reports[0] || { n: 0, approved: 0, rating: null };
      const attendancePct = Math.min(100, Math.round((present / Math.max(1, workingDays)) * 100));
      const salesPct = target?.salesAmount ? Math.round((salesAmount / target.salesAmount) * 100) : null;
      const visitPct = target?.visits ? Math.round((v.n / target.visits) * 100) : null;
      const reportPct = Math.round((rep.n / Math.max(1, workingDays)) * 100);
      const cap = (x) => Math.min(100, x ?? 0);
      // Weighted score: sales 40, visits 25, attendance 20, reporting 15
      const score = Math.round(cap(salesPct) * 0.4 + cap(visitPct) * 0.25 + attendancePct * 0.2 + cap(reportPct) * 0.15);
      return {
        user: u,
        attendance: { present, workingDays, percent: attendancePct },
        visits: { count: v.n, target: target?.visits ?? null, percent: visitPct, invalidLocation: v.invalid },
        distanceKm: Math.round(v.km * 10) / 10,
        sales: { achieved: salesAmount, target: target?.salesAmount ?? null, percent: salesPct },
        reports: { submitted: rep.n, approved: rep.approved, avgRating: rep.rating ? Math.round(rep.rating * 10) / 10 : null },
        expenses: expenses[0]?.t ?? 0,
        score,
      };
    }),
  );
  res.json({ period, items: rows.sort((a, b) => b.score - a.score) });
});

/** Reassign a junior to a manager (admin or the current manager). */
r.post('/juniors/:id/assign', authorize(MANAGERS), validate(z.object({ manager: z.string().regex(/^[a-f\d]{24}$/i) })), async (req, res) => {
  await assertCanManage(req.user, req.params.id);
  if (req.valid.body.manager === req.params.id) throw badRequest('User cannot report to themselves');
  const subs = await User.subordinateIds(req.params.id);
  if (subs.some((id) => String(id) === req.valid.body.manager)) throw badRequest('Circular reporting line');
  const u = await User.findByIdAndUpdate(req.params.id, { manager: req.valid.body.manager }, { returnDocument: 'after' });
  res.json(u.toPublic());
});

export default r;
