import { Router } from 'express';
import { z } from 'zod';
import { ADMINS, MANAGERS, isAdmin } from '../config/roles.js';
import { authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Claim, Distributor, File, Invoice, Order, ORDER_STATUSES, Retailer, User, nextNumber } from '../models/index.js';
import { createInvoiceForOrder, priceOrderItems } from '../services/billing.js';
import { sendInvoicePdf } from '../services/documents.js';
import { notify } from '../services/messaging.js';
import { recordStock } from '../services/stock.js';
import { rangeFromQuery } from '../utils/dates.js';
import { badRequest, escapeRegex, forbidden, notFound, paged } from '../utils/http.js';
import { assertDistributorAccess, distributorScopeFilter } from '../utils/scope.js';

const r = Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i);

const partnerUsers = (distributorId) => User.find({ distributor: distributorId, userType: 'partner', isBlocked: false }).distinct('_id');
const adminUsers = () => User.find({ role: { $in: ADMINS }, isBlocked: false }).distinct('_id');

/* ---------------------------------- Orders ---------------------------------- */

/** Price preview (cart summary) without placing the order. */
r.post('/orders/quote', validate(z.object({ items: z.array(z.object({ product: objectId, qty: z.number().int().positive(), discountPct: z.number().optional() })).min(1) })), async (req, res) => {
  const items = req.valid.body.items.map((i) => ({ ...i, discountPct: isAdmin(req.user) ? i.discountPct : 0 }));
  res.json(await priceOrderItems(items));
});

r.post(
  '/orders',
  validate(
    z.object({
      distributor: objectId.optional(),
      items: z.array(z.object({ product: objectId, qty: z.number().int().positive(), discountPct: z.number().min(0).max(100).optional() })).min(1),
      shippingAddress: z.string().optional(),
      notes: z.string().optional(),
    }),
  ),
  async (req, res) => {
    const b = req.valid.body;
    const distributorId = b.distributor || req.user.distributor;
    if (!distributorId) throw badRequest('distributor is required');
    await assertDistributorAccess(req.user, distributorId);
    const distributor = await Distributor.findById(distributorId);
    if (!distributor?.isActive) throw badRequest('Distributor is inactive');
    // Only admins can grant discounts; partners get the catalog price list.
    const items = b.items.map((i) => ({ ...i, discountPct: isAdmin(req.user) ? i.discountPct : 0 }));
    const priced = await priceOrderItems(items);
    const order = await Order.create({
      ...priced,
      orderNo: await nextNumber('ORD'),
      distributor: distributor._id,
      placedBy: req.user._id,
      shippingAddress: b.shippingAddress || distributor.address,
      notes: b.notes,
      statusHistory: [{ status: 'processing', at: new Date(), by: req.user._id }],
    });
    notify(await adminUsers(), { title: 'New order', body: `${distributor.name} placed ${order.orderNo} (INR ${order.grandTotal.toLocaleString('en-IN')})`, type: 'order', data: { id: String(order._id) } });
    res.status(201).json(order);
  },
);

r.get('/orders', async (req, res) => {
  const scope = await distributorScopeFilter(req.user, req.query.distributor);
  const { from, to } = rangeFromQuery({ from: req.query.from || '2000-01-01', to: req.query.to });
  const filter = { ...scope, createdAt: { $gte: from, $lt: to } };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) filter.orderNo = new RegExp(escapeRegex(req.query.q), 'i');
  res.json(await paged(Order, filter, req.query, { populate: [{ path: 'distributor', select: 'name code' }, { path: 'invoice', select: 'invoiceNo grandTotal' }] }));
});

r.get('/orders/:id', async (req, res) => {
  const order = await Order.findById(req.params.id).populate('distributor', 'name code address').populate('placedBy', 'name').populate('invoice', 'invoiceNo').populate('statusHistory.by', 'name');
  if (!order) throw notFound();
  await assertDistributorAccess(req.user, order.distributor._id);
  res.json(order);
});

const NEXT = { processing: ['packed', 'cancelled'], packed: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };

r.post(
  '/orders/:id/status',
  validate(z.object({ status: z.enum(ORDER_STATUSES), note: z.string().optional(), trackingInfo: z.string().optional() })),
  async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw notFound();
    const { status, note, trackingInfo } = req.valid.body;
    const partnerCancel = req.user.userType === 'partner' && status === 'cancelled' && order.status === 'processing';
    if (!isAdmin(req.user) && !partnerCancel) throw forbidden('Only admin can update order status');
    await assertDistributorAccess(req.user, order.distributor);
    if (!NEXT[order.status].includes(status)) throw badRequest(`Cannot move order from ${order.status} to ${status}`);

    order.status = status;
    if (trackingInfo) order.trackingInfo = trackingInfo;
    order.statusHistory.push({ status, at: new Date(), by: req.user._id, note });
    await order.save();

    const distributor = await Distributor.findById(order.distributor);
    if (status === 'packed') await createInvoiceForOrder(order, distributor);
    // Delivered goods are automatically posted as Stock In for the distributor.
    if (status === 'delivered' && !order.stockPosted) {
      for (const i of order.items) await recordStock({ distributor: order.distributor, product: i.product, type: 'in', qty: i.qty, reference: order.orderNo, createdBy: req.user._id });
      order.stockPosted = true;
      await order.save();
    }
    notify(await partnerUsers(order.distributor), { title: `Order ${status}`, body: `${order.orderNo} is now ${status}${trackingInfo ? ` (${trackingInfo})` : ''}`, type: 'order', data: { id: String(order._id) } });
    res.json(order);
  },
);

/* --------------------------------- Invoices --------------------------------- */

r.get('/invoices', async (req, res) => {
  const scope = await distributorScopeFilter(req.user, req.query.distributor);
  const { from, to } = rangeFromQuery({ from: req.query.from || '2000-01-01', to: req.query.to });
  res.json(await paged(Invoice, { ...scope, issuedAt: { $gte: from, $lt: to } }, req.query, { sort: { issuedAt: -1 }, populate: { path: 'order', select: 'orderNo status' } }));
});

r.get('/invoices/:id/pdf', async (req, res) => {
  const inv = await Invoice.findById(req.params.id);
  if (!inv) throw notFound();
  await assertDistributorAccess(req.user, inv.distributor);
  sendInvoicePdf(res, inv);
});

/* -------------------------------- Retailers -------------------------------- */

const retailerSchema = z.object({
  name: z.string().min(1),
  shopName: z.string().optional(),
  contact: z.object({ person: z.string().optional(), mobile: z.string().regex(/^\+?\d{10,13}$/, 'Invalid mobile'), email: z.string().email().optional() }),
  address: z.string().optional(),
  city: z.string().optional(),
  pincode: z.string().regex(/^\d{6}$/).optional(),
  location: z.object({ lat: z.number(), lng: z.number() }).optional(),
  distributor: objectId.optional(),
  kyc: z
    .object({
      pan: z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Invalid PAN').optional(),
      aadhaar: z.string().regex(/^\d{12}$/, 'Invalid Aadhaar').optional(),
      gstin: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'Invalid GSTIN').optional(),
      panFile: objectId.optional(),
      aadhaarFile: objectId.optional(),
      gstFile: objectId.optional(),
    })
    .optional(),
});

r.post('/retailers', validate(retailerSchema), async (req, res) => {
  const b = req.valid.body;
  const distributorId = b.distributor || req.user.distributor;
  if (!distributorId) throw badRequest('distributor is required');
  await assertDistributorAccess(req.user, distributorId);
  const distributor = await Distributor.findById(distributorId);
  // Tag KYC files with the distributor so its staff/assigned employees can view them.
  const fileIds = [b.kyc?.panFile, b.kyc?.aadhaarFile, b.kyc?.gstFile].filter(Boolean);
  if (fileIds.length) await File.updateMany({ _id: { $in: fileIds }, owner: req.user._id }, { distributor: distributor._id });
  const retailer = await Retailer.create({ ...b, distributor: distributor._id, distributorCode: distributor.code, createdBy: req.user._id });
  res.status(201).json(retailer);
});

/** ?q=&city=&distributor=&kycStatus=&sort=name|-createdAt */
r.get('/retailers', async (req, res) => {
  const filter = await distributorScopeFilter(req.user, req.query.distributor);
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i');
    filter.$or = [{ name: rx }, { shopName: rx }, { 'contact.mobile': rx }, { city: rx }];
  }
  if (req.query.city) filter.city = new RegExp(`^${escapeRegex(req.query.city)}$`, 'i');
  if (req.query.kycStatus) filter['kyc.status'] = req.query.kycStatus;
  const result = await paged(Retailer, filter, req.query, { sort: { name: 1 }, populate: { path: 'distributor', select: 'name code' } });
  result.items = result.items.map((r_) => {
    const o = r_.toJSON();
    if (o.kyc?.aadhaar) o.kyc.aadhaar = `********${o.kyc.aadhaar.slice(-4)}`;
    return o;
  });
  res.json(result);
});

r.get('/retailers/:id', async (req, res) => {
  const ret = await Retailer.findById(req.params.id).populate('distributor', 'name code').populate('createdBy', 'name');
  if (!ret) throw notFound();
  await assertDistributorAccess(req.user, ret.distributor._id);
  res.json(ret);
});

r.patch('/retailers/:id', validate(retailerSchema.partial()), async (req, res) => {
  const ret = await Retailer.findById(req.params.id);
  if (!ret) throw notFound();
  await assertDistributorAccess(req.user, ret.distributor);
  const { distributor: _ignored, kyc, ...rest } = req.valid.body;
  Object.assign(ret, rest);
  if (kyc) Object.assign(ret.kyc, kyc, { status: 'pending' });
  res.json(await ret.save());
});

r.post('/retailers/:id/kyc-review', authorize(MANAGERS), validate(z.object({ status: z.enum(['verified', 'rejected']) })), async (req, res) => {
  const ret = await Retailer.findById(req.params.id);
  if (!ret) throw notFound();
  await assertDistributorAccess(req.user, ret.distributor);
  ret.kyc.status = req.valid.body.status;
  res.json(await ret.save());
});

/* ---------------------------- Claims & settlements ---------------------------- */

r.post(
  '/claims',
  validate(
    z.object({
      distributor: objectId.optional(),
      type: z.enum(['scheme', 'discount', 'damage', 'transport', 'other']),
      schemeName: z.string().optional(),
      periodFrom: z.string().optional(),
      periodTo: z.string().optional(),
      amount: z.number().positive(),
      description: z.string().optional(),
      attachments: z.array(objectId).default([]),
    }),
  ),
  async (req, res) => {
    const b = req.valid.body;
    const distributor = b.distributor || req.user.distributor;
    if (!distributor) throw badRequest('distributor is required');
    await assertDistributorAccess(req.user, distributor);
    const claim = await Claim.create({ ...b, distributor, claimNo: await nextNumber('CLM'), submittedBy: req.user._id, history: [{ status: 'pending', by: req.user._id }] });
    notify(await adminUsers(), { title: 'New claim', body: `${claim.claimNo}: INR ${claim.amount} (${claim.type})`, type: 'claim', data: { id: String(claim._id) } });
    res.status(201).json(claim);
  },
);

r.get('/claims', async (req, res) => {
  const filter = await distributorScopeFilter(req.user, req.query.distributor);
  if (req.query.status) filter.status = req.query.status;
  res.json(await paged(Claim, filter, req.query, { populate: [{ path: 'distributor', select: 'name code' }, { path: 'attachments', select: 'originalName mimeType' }] }));
});

r.get('/claims/:id', async (req, res) => {
  const claim = await Claim.findById(req.params.id).populate('distributor', 'name code').populate('attachments', 'originalName mimeType').populate('history.by', 'name');
  if (!claim) throw notFound();
  await assertDistributorAccess(req.user, claim.distributor._id);
  res.json(claim);
});

/** Partner re-submits after "revision_requested". */
r.patch('/claims/:id', validate(z.object({ amount: z.number().positive().optional(), description: z.string().optional(), attachments: z.array(objectId).optional() })), async (req, res) => {
  const claim = await Claim.findById(req.params.id);
  if (!claim) throw notFound();
  await assertDistributorAccess(req.user, claim.distributor);
  if (!['pending', 'revision_requested'].includes(claim.status)) throw badRequest(`Claim is ${claim.status}`);
  Object.assign(claim, req.valid.body, { status: 'pending' });
  claim.history.push({ status: 'pending', by: req.user._id, note: 'Revised' });
  res.json(await claim.save());
});

r.post(
  '/claims/:id/review',
  authorize(ADMINS),
  validate(z.object({ status: z.enum(['approved', 'rejected', 'revision_requested', 'settled']), approvedAmount: z.number().min(0).optional(), note: z.string().optional(), settlementRef: z.string().optional() })),
  async (req, res) => {
    const claim = await Claim.findById(req.params.id);
    if (!claim) throw notFound();
    const b = req.valid.body;
    if (b.status === 'settled' && claim.status !== 'approved') throw badRequest('Only approved claims can be settled');
    claim.status = b.status;
    if (b.status === 'approved') claim.approvedAmount = b.approvedAmount ?? claim.amount;
    if (b.status === 'settled') Object.assign(claim, { settledAt: new Date(), settlementRef: b.settlementRef });
    claim.history.push({ status: b.status, by: req.user._id, note: b.note });
    await claim.save();
    const msg = { approved: `approved for INR ${claim.approvedAmount}`, rejected: 'rejected', revision_requested: 'needs revision', settled: 'settled' }[b.status];
    notify(await partnerUsers(claim.distributor), { title: `Claim ${claim.claimNo}`, body: `Your claim was ${msg}${b.note ? `: ${b.note}` : ''}`, type: 'claim', data: { id: String(claim._id) } });
    res.json(claim);
  },
);

export default r;
