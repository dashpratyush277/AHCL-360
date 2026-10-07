import { Router } from 'express';
import { z } from 'zod';
import { ADMINS, MANAGERS, isAdmin } from '../config/roles.js';
import { authorize, requireUserType } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Distributor, Product, ReorderSetting, Retailer, SalesOrder, StockTxn, Target, User, Visit } from '../models/index.js';
import { notify } from '../services/messaging.js';
import { closingStock, recordStock, reorderSuggestions } from '../services/stock.js';
import { dayKey, monthKey, periodRange, quarterKey, rangeFromQuery } from '../utils/dates.js';
import { badRequest, escapeRegex, notFound, paged } from '../utils/http.js';
import { assertCanManage, assertDistributorAccess, distributorScopeFilter, userScopeFilter } from '../utils/scope.js';

const r = Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i);

/* --------------------------------- Products --------------------------------- */

r.get('/products', async (req, res) => {
  const filter = { isActive: true };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.q) filter.$or = [{ name: new RegExp(escapeRegex(req.query.q), 'i') }, { sku: new RegExp(escapeRegex(req.query.q), 'i') }];
  if (isAdmin(req.user) && req.query.all) delete filter.isActive;
  const [result, categories] = await Promise.all([paged(Product, filter, { limit: 200, ...req.query }, { sort: { name: 1 } }), Product.distinct('category', { isActive: true })]);
  res.json({ ...result, categories });
});

const productSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
  unit: z.string().default('pcs'),
  packSize: z.number().optional(),
  mrp: z.number().min(0).optional(),
  price: z.number().min(0),
  gstRate: z.number().refine((v) => [0, 0.25, 3, 5, 12, 18, 28].includes(v), 'Invalid GST slab').default(18),
  hsn: z.string().optional(),
  defaultReorderLevel: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});
r.post('/products', authorize(ADMINS), validate(productSchema), async (req, res) => res.status(201).json(await Product.create(req.valid.body)));
r.patch('/products/:id', authorize(ADMINS), validate(productSchema.partial()), async (req, res) => {
  const p = await Product.findByIdAndUpdate(req.params.id, req.valid.body, { returnDocument: 'after', runValidators: true });
  if (!p) throw notFound();
  res.json(p);
});

/* ------------------------------- Distributors ------------------------------- */

r.get('/distributors', async (req, res) => {
  const filter = await distributorScopeFilter(req.user, undefined, '_id');
  if (req.query.tier) filter.tier = req.query.tier;
  if (req.query.q) filter.$or = [{ name: new RegExp(escapeRegex(req.query.q), 'i') }, { code: new RegExp(escapeRegex(req.query.q), 'i') }];
  res.json(await paged(Distributor, filter, req.query, { sort: { name: 1 }, populate: [{ path: 'territory', select: 'name code' }, { path: 'assignedEmployees', select: 'name employeeCode' }] }));
});

r.get('/distributors/:id', async (req, res) => {
  await assertDistributorAccess(req.user, req.params.id);
  const d = await Distributor.findById(req.params.id).populate('parent', 'name code').populate('territory', 'name').populate('assignedEmployees', 'name mobile');
  if (!d) throw notFound();
  res.json(d);
});

const distributorSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(2),
  tier: z.enum(['super_distributor', 'distributor', 'stockist']),
  parent: objectId.optional(),
  gstin: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'Invalid GSTIN').optional(),
  pan: z.string().optional(),
  stateCode: z.string().optional(),
  contact: z.object({ person: z.string().optional(), mobile: z.string().optional(), email: z.string().optional() }).optional(),
  address: z.string().optional(),
  location: z.object({ lat: z.number(), lng: z.number() }).optional(),
  territory: objectId.optional(),
  assignedEmployees: z.array(objectId).optional(),
  creditLimit: z.number().optional(),
  isActive: z.boolean().optional(),
});
r.post('/distributors', authorize(ADMINS), validate(distributorSchema), async (req, res) => {
  const b = req.valid.body;
  if (b.gstin && !b.stateCode) b.stateCode = b.gstin.slice(0, 2);
  res.status(201).json(await Distributor.create(b));
});
r.patch('/distributors/:id', authorize(ADMINS), validate(distributorSchema.partial()), async (req, res) => {
  const d = await Distributor.findById(req.params.id);
  if (!d) throw notFound();
  Object.assign(d, req.valid.body);
  res.json(await d.save());
});

/* ----------------------------------- Stock ---------------------------------- */

const resolveDistributor = (req, id) => id || req.user.distributor;

/** Distributor-wise stock statement: opening / in / out / return / adjustment / closing. */
r.get('/stock', async (req, res) => {
  const distributor = resolveDistributor(req, req.query.distributor);
  if (!distributor) throw badRequest('distributor is required');
  await assertDistributorAccess(req.user, distributor);
  const from = req.query.from ? new Date(`${req.query.from}T00:00:00+05:30`) : undefined;
  const to = req.query.to ? new Date(new Date(`${req.query.to}T00:00:00+05:30`).getTime() + 86_400_000) : undefined;
  res.json({ distributor, items: await closingStock(distributor, { from, to }) });
});

const stockTxnSchema = z.object({
  distributor: objectId.optional(),
  product: objectId,
  type: z.enum(['in', 'out', 'return', 'adjustment']),
  qty: z.number().positive().optional(),
  delta: z.number().optional(), // adjustment only; negative for damaged/lost
  reason: z.string().optional(),
  reference: z.string().optional(),
  date: z.coerce.date().optional(),
  clientId: z.string().optional(),
});

export async function createStockTxn(req, b) {
  const distributor = resolveDistributor(req, b.distributor);
  if (!distributor) throw badRequest('distributor is required');
  await assertDistributorAccess(req.user, distributor);
  if (b.clientId) {
    const dup = await StockTxn.findOne({ distributor, clientId: b.clientId });
    if (dup) return dup;
  }
  if (b.type !== 'adjustment' && !b.qty) throw badRequest('qty is required');
  return recordStock({ ...b, distributor, createdBy: req.user._id });
}

r.post('/stock/txns', validate(stockTxnSchema), async (req, res) => res.status(201).json(await createStockTxn(req, req.valid.body)));

r.get('/stock/txns', async (req, res) => {
  const scope = await distributorScopeFilter(req.user, resolveDistributor(req, req.query.distributor));
  const { from, to } = rangeFromQuery(req.query);
  const filter = { ...scope, date: { $gte: from, $lt: to } };
  if (req.query.type) filter.type = req.query.type;
  if (req.query.product) filter.product = req.query.product;
  res.json(await paged(StockTxn, filter, req.query, { sort: { date: -1 }, populate: [{ path: 'product', select: 'sku name unit' }, { path: 'createdBy', select: 'name' }] }));
});

r.get('/stock/reorder-suggestions', async (req, res) => {
  const distributor = resolveDistributor(req, req.query.distributor);
  if (!distributor) throw badRequest('distributor is required');
  await assertDistributorAccess(req.user, distributor);
  res.json({ items: await reorderSuggestions(distributor) });
});

r.put('/stock/reorder-levels', validate(z.object({ distributor: objectId.optional(), product: objectId, reorderLevel: z.number().min(0) })), async (req, res) => {
  const distributor = resolveDistributor(req, req.valid.body.distributor);
  await assertDistributorAccess(req.user, distributor);
  const s = await ReorderSetting.findOneAndUpdate({ distributor, product: req.valid.body.product }, { reorderLevel: req.valid.body.reorderLevel }, { upsert: true, returnDocument: 'after' });
  res.json(s);
});

/* --------------------------- Daily Sales Orders (DSO) -------------------------- */

const dsoSchema = z.object({
  distributor: objectId.optional(),
  retailer: objectId.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  items: z.array(z.object({ product: objectId, qty: z.number().positive(), price: z.number().min(0).optional() })).min(1),
  remarks: z.string().optional(),
  clientId: z.string().optional(),
});

export async function createDso(user, b) {
  if (b.clientId) {
    const dup = await SalesOrder.findOne({ user: user._id, clientId: b.clientId });
    if (dup) return dup;
  }
  if (!b.distributor && !b.retailer) throw badRequest('distributor or retailer is required');
  if (b.distributor) await assertDistributorAccess(user, b.distributor);
  const products = await Product.find({ _id: { $in: b.items.map((i) => i.product) } }).lean();
  const pm = new Map(products.map((p) => [String(p._id), p]));
  const items = b.items.map((i) => {
    const p = pm.get(i.product);
    if (!p) throw badRequest(`Unknown product ${i.product}`);
    const price = i.price ?? p.price;
    return { product: p._id, name: p.name, qty: i.qty, price, amount: Math.round(price * i.qty * 100) / 100 };
  });
  return SalesOrder.create({ ...b, user: user._id, date: b.date || dayKey(), items, total: items.reduce((a, i) => a + i.amount, 0) });
}

r.post('/dso', requireUserType('employee'), validate(dsoSchema), async (req, res) => res.status(201).json(await createDso(req.user, req.valid.body)));

r.get('/dso', requireUserType('employee'), async (req, res) => {
  const scope = req.query.scope === 'team' ? await userScopeFilter(req.user, req.query.user) : { user: req.user._id };
  const { from, to } = rangeFromQuery(req.query);
  const filter = { ...scope, createdAt: { $gte: from, $lt: to } };
  if (req.query.distributor) filter.distributor = req.query.distributor;
  res.json(await paged(SalesOrder, filter, req.query, { populate: [{ path: 'distributor', select: 'name code' }, { path: 'retailer', select: 'name shopName' }, { path: 'user', select: 'name' }] }));
});

/* ------------------------------ Targets vs Achievement ------------------------------ */

export async function achievement(userId, period) {
  const { start, end } = periodRange(period);
  const [sales, visits, retailers] = await Promise.all([
    SalesOrder.aggregate([{ $match: { user: userId, createdAt: { $gte: start, $lt: end } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
    Visit.countDocuments({ user: userId, 'checkIn.time': { $gte: start, $lt: end } }),
    Retailer.countDocuments({ createdBy: userId, createdAt: { $gte: start, $lt: end } }),
  ]);
  return { salesAmount: sales[0]?.total ?? 0, visits, newRetailers: retailers };
}

r.get('/targets', requireUserType('employee'), async (req, res) => {
  const scope = await userScopeFilter(req.user, req.query.user || req.user._id);
  const userId = (await User.findById(scope.user))._id;
  const periods = [monthKey(), quarterKey()];
  if (req.query.period) periods.splice(0, 2, req.query.period);
  const items = await Promise.all(
    periods.map(async (period) => {
      const target = await Target.findOne({ user: userId, period }).lean();
      const achieved = await achievement(userId, period);
      const pct = (a, t) => (t ? Math.round((a / t) * 1000) / 10 : null);
      return {
        period,
        periodType: period.includes('Q') ? 'quarter' : 'month',
        target: target || null,
        achieved,
        percent: { salesAmount: pct(achieved.salesAmount, target?.salesAmount), visits: pct(achieved.visits, target?.visits), newRetailers: pct(achieved.newRetailers, target?.newRetailers) },
      };
    }),
  );
  res.json({ items });
});

r.put(
  '/targets',
  authorize(MANAGERS),
  validate(z.object({ user: objectId, periodType: z.enum(['month', 'quarter']), period: z.string().regex(/^\d{4}-(\d{2}|Q[1-4])$/), salesAmount: z.number().min(0).default(0), visits: z.number().min(0).default(0), newRetailers: z.number().min(0).default(0) })),
  async (req, res) => {
    const b = req.valid.body;
    await assertCanManage(req.user, b.user);
    const t = await Target.findOneAndUpdate({ user: b.user, period: b.period }, { ...b, setBy: req.user._id }, { upsert: true, returnDocument: 'after' });
    notify(b.user, { title: 'Target updated', body: `Your ${b.periodType} target for ${b.period}: INR ${b.salesAmount.toLocaleString('en-IN')}`, type: 'target' });
    res.json(t);
  },
);

export default r;
