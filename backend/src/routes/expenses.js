import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { ADMINS, MANAGERS } from '../config/roles.js';
import { authorize, requireUserType } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Expense } from '../models/index.js';
import { notify } from '../services/messaging.js';
import { dayDistanceKm } from '../services/tracking.js';
import { rangeFromQuery } from '../utils/dates.js';
import { badRequest, notFound, paged } from '../utils/http.js';
import { assertCanManage, userScopeFilter } from '../utils/scope.js';

const r = Router();
r.use(requireUserType('employee'));

const objectId = z.string().regex(/^[a-f\d]{24}$/i);

export const expenseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.enum(['travel', 'food', 'lodging', 'phone', 'other']).default('travel'),
  travelMode: z.enum(['bike', 'car', 'public']).optional(),
  fromPlace: z.string().optional(),
  toPlace: z.string().optional(),
  distanceKm: z.number().min(0).optional(),
  amount: z.number().min(0).optional(),
  description: z.string().optional(),
  bills: z.array(objectId).default([]),
  // When true for travel claims, distance is taken from the GPS trail of that day.
  useGpsDistance: z.boolean().default(false),
  clientId: z.string().optional(),
});

/** Preview auto-calculated travel amount: ?date=YYYY-MM-DD&mode=bike */
r.get('/estimate', async (req, res) => {
  const mode = req.query.mode || req.user.travelMode || 'bike';
  const distanceKm = await dayDistanceKm(req.user._id, req.query.date);
  const ratePerKm = env.expenseRatesPerKm[mode];
  res.json({ date: req.query.date, mode, distanceKm, ratePerKm, amount: Math.round(distanceKm * ratePerKm * 100) / 100 });
});

export async function createExpense(user, b) {
  if (b.clientId) {
    const dup = await Expense.findOne({ user: user._id, clientId: b.clientId });
    if (dup) return dup;
  }
  const doc = { ...b, user: user._id };
  if (b.category === 'travel') {
    doc.travelMode = b.travelMode || user.travelMode || 'bike';
    doc.ratePerKm = env.expenseRatesPerKm[doc.travelMode];
    if (b.useGpsDistance || b.distanceKm == null) {
      doc.distanceKm = await dayDistanceKm(user._id, b.date);
      doc.autoCalculated = true;
    }
    // Public transport is reimbursed on actual bills; personal vehicles by distance.
    if (doc.travelMode !== 'public' || b.amount == null) doc.amount = Math.round(doc.distanceKm * doc.ratePerKm * 100) / 100;
  }
  if (doc.amount == null) throw badRequest('Amount is required');
  if (doc.category !== 'travel' && !doc.bills.length && doc.amount > 500) throw badRequest('Bills are required for claims above INR 500');
  const exp = await Expense.create(doc);
  if (user.manager) notify(user.manager, { title: 'Expense claim', body: `${user.name} submitted INR ${exp.amount} (${exp.category})`, type: 'expense', data: { id: String(exp._id) } });
  return exp;
}

r.post('/', validate(expenseSchema), async (req, res) => res.status(201).json(await createExpense(req.user, req.valid.body)));

/** ?scope=mine|team&status=&from=&to= */
r.get('/', async (req, res) => {
  const scope = req.query.scope === 'team' ? await userScopeFilter(req.user, req.query.user) : { user: req.user._id };
  const { from, to } = rangeFromQuery(req.query);
  const filter = { ...scope, createdAt: { $gte: from, $lt: to }, ...(req.query.status ? { status: req.query.status } : {}) };
  const result = await paged(Expense, filter, req.query, { populate: [{ path: 'user', select: 'name employeeCode' }, { path: 'bills', select: 'originalName mimeType' }] });
  const totals = await Expense.aggregate([{ $match: filter }, { $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } }]);
  res.json({ ...result, totals });
});

r.patch('/:id', validate(expenseSchema.partial()), async (req, res) => {
  const exp = await Expense.findOne({ _id: req.params.id, user: req.user._id });
  if (!exp) throw notFound();
  if (exp.status !== 'pending') throw badRequest('Only pending claims can be edited');
  Object.assign(exp, req.valid.body);
  res.json(await exp.save());
});

r.delete('/:id', async (req, res) => {
  const exp = await Expense.findOne({ _id: req.params.id, user: req.user._id, status: 'pending' });
  if (!exp) throw notFound('Pending claim not found');
  await exp.deleteOne();
  res.json({ ok: true });
});

r.post(
  '/:id/review',
  authorize(MANAGERS),
  validate(z.object({ status: z.enum(['approved', 'rejected']), approvedAmount: z.number().min(0).optional(), comment: z.string().optional() })),
  async (req, res) => {
    const exp = await Expense.findById(req.params.id);
    if (!exp) throw notFound();
    await assertCanManage(req.user, exp.user);
    if (exp.status !== 'pending') throw badRequest(`Claim already ${exp.status}`);
    const b = req.valid.body;
    Object.assign(exp, { status: b.status, approvedAmount: b.status === 'approved' ? (b.approvedAmount ?? exp.amount) : 0, reviewComment: b.comment, reviewedBy: req.user._id, reviewedAt: new Date() });
    await exp.save();
    notify(exp.user, { title: `Expense ${exp.status}`, body: `Your claim of INR ${exp.amount} dated ${exp.date} was ${exp.status}`, type: 'expense', data: { id: String(exp._id) } });
    res.json(exp);
  },
);

/** Finance marks approved claims as reimbursed. */
r.post('/:id/reimburse', authorize(ADMINS), validate(z.object({ reference: z.string().optional() })), async (req, res) => {
  const exp = await Expense.findById(req.params.id);
  if (!exp) throw notFound();
  if (exp.status !== 'approved') throw badRequest('Only approved claims can be reimbursed');
  Object.assign(exp, { status: 'reimbursed', reimbursedAt: new Date(), reimbursementRef: req.valid.body.reference });
  await exp.save();
  notify(exp.user, { title: 'Expense reimbursed', body: `INR ${exp.approvedAmount} has been reimbursed`, type: 'expense' });
  res.json(exp);
});

export default r;
