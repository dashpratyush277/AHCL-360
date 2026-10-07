import { Router } from 'express';
import { z } from 'zod';
import { ADMINS, MANAGERS, isAdmin } from '../config/roles.js';
import { authorize, requireUserType } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Document, File, Holiday, Leave, Payslip, User } from '../models/index.js';
import { sendPayslipPdf } from '../services/documents.js';
import { notify } from '../services/messaging.js';
import { daysBetweenInclusive } from '../utils/dates.js';
import { badRequest, forbidden, notFound, paged } from '../utils/http.js';
import { assertCanManage, userScopeFilter } from '../utils/scope.js';

const r = Router();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const objectId = z.string().regex(/^[a-f\d]{24}$/i);

/* ---------------------------- Holidays (all users) ---------------------------- */

r.get('/holidays', async (req, res) => {
  const year = req.query.year || String(new Date().getFullYear());
  res.json({ items: await Holiday.find({ date: { $regex: `^${year}` } }).sort({ date: 1 }) });
});

r.post(
  '/holidays',
  authorize(ADMINS),
  validate(z.object({ date, name: z.string().min(1), type: z.enum(['national', 'regional', 'optional', 'company']).default('company'), region: z.string().optional() })),
  async (req, res) => res.status(201).json(await Holiday.create(req.valid.body)),
);

r.delete('/holidays/:id', authorize(ADMINS), async (req, res) => {
  await Holiday.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

/* Everything below is employee-only */
r.use(requireUserType('employee'));

/* ---------------------------------- Leaves ---------------------------------- */

r.post(
  '/leaves',
  validate(z.object({ type: z.enum(['casual', 'sick', 'earned', 'unpaid', 'other']), from: date, to: date, halfDay: z.boolean().default(false), reason: z.string().min(3) })),
  async (req, res) => {
    const { from, to, halfDay } = req.valid.body;
    if (to < from) throw badRequest('"to" must be on or after "from"');
    const overlap = await Leave.exists({ user: req.user._id, status: { $in: ['pending', 'approved'] }, from: { $lte: to }, to: { $gte: from } });
    if (overlap) throw badRequest('You already have a leave request overlapping these dates');
    const days = halfDay ? 0.5 : daysBetweenInclusive(from, to);
    const leave = await Leave.create({ ...req.valid.body, user: req.user._id, days });
    if (req.user.manager) notify(req.user.manager, { title: 'Leave request', body: `${req.user.name} applied for ${days} day(s) leave (${from} to ${to})`, type: 'leave', data: { id: String(leave._id) } });
    res.status(201).json(leave);
  },
);

/** ?scope=mine (default) | team ; ?status= */
r.get('/leaves', async (req, res) => {
  const scope = req.query.scope === 'team' ? await userScopeFilter(req.user, req.query.user) : { user: req.user._id };
  const filter = { ...scope, ...(req.query.status ? { status: req.query.status } : {}) };
  res.json(await paged(Leave, filter, req.query, { populate: { path: 'user', select: 'name employeeCode' } }));
});

r.get('/leaves/balance', async (req, res) => {
  const year = String(new Date().getFullYear());
  const quota = { casual: 12, sick: 10, earned: 15 };
  const used = await Leave.aggregate([
    { $match: { user: req.user._id, status: 'approved', from: { $regex: `^${year}` } } },
    { $group: { _id: '$type', days: { $sum: '$days' } } },
  ]);
  const usedMap = Object.fromEntries(used.map((u) => [u._id, u.days]));
  res.json(Object.fromEntries(Object.entries(quota).map(([k, q]) => [k, { quota: q, used: usedMap[k] || 0, available: q - (usedMap[k] || 0) }])));
});

r.post('/leaves/:id/cancel', async (req, res) => {
  const leave = await Leave.findOne({ _id: req.params.id, user: req.user._id });
  if (!leave) throw notFound('Leave not found');
  if (leave.status !== 'pending') throw badRequest('Only pending requests can be cancelled');
  leave.status = 'cancelled';
  res.json(await leave.save());
});

r.post(
  '/leaves/:id/review',
  authorize(MANAGERS),
  validate(z.object({ status: z.enum(['approved', 'rejected']), comment: z.string().optional() })),
  async (req, res) => {
    const leave = await Leave.findById(req.params.id);
    if (!leave) throw notFound('Leave not found');
    await assertCanManage(req.user, leave.user);
    if (leave.status !== 'pending') throw badRequest(`Leave already ${leave.status}`);
    Object.assign(leave, { status: req.valid.body.status, reviewComment: req.valid.body.comment, reviewedBy: req.user._id, reviewedAt: new Date() });
    await leave.save();
    notify(leave.user, { title: `Leave ${leave.status}`, body: `Your leave from ${leave.from} to ${leave.to} was ${leave.status}${leave.reviewComment ? `: ${leave.reviewComment}` : ''}`, type: 'leave', data: { id: String(leave._id) } });
    res.json(leave);
  },
);

/* ---------------------------- Payslips & salary ---------------------------- */

r.get('/payslips', async (req, res) => {
  const scope = await userScopeFilter(req.user, req.query.user || req.user._id);
  res.json({ items: await Payslip.find(scope).sort({ month: -1 }).select('-earnings -deductions') });
});

r.get('/payslips/:month/pdf', async (req, res) => {
  const scope = await userScopeFilter(req.user, req.query.user || req.user._id);
  const slip = await Payslip.findOne({ ...scope, month: req.params.month });
  if (!slip) throw notFound('Payslip not available for this month');
  if (slip.file) return res.redirect(`/api/files/${slip.file}?download=1`);
  sendPayslipPdf(res, slip, await User.findById(slip.user));
});

r.get('/salary-summary', async (req, res) => {
  const scope = await userScopeFilter(req.user, req.query.user || req.user._id);
  const slips = await Payslip.find(scope).sort({ month: -1 }).limit(12).lean();
  const ytd = slips.reduce((a, s) => ({ gross: a.gross + (s.gross || 0), net: a.net + (s.net || 0) }), { gross: 0, net: 0 });
  const u = await User.findById(scope.user).lean();
  res.json({ structure: u?.salary || {}, last12Months: slips.map((s) => ({ month: s.month, gross: s.gross, net: s.net, creditedAt: s.creditedAt })), totals: ytd });
});

const lines = z.array(z.object({ label: z.string(), amount: z.number() }));
r.post(
  '/payslips',
  authorize(ADMINS),
  validate(z.object({ user: objectId, month: z.string().regex(/^\d{4}-\d{2}$/), earnings: lines, deductions: lines.default([]), paidDays: z.number().optional(), creditedAt: z.coerce.date().optional(), file: objectId.optional() })),
  async (req, res) => {
    const b = req.valid.body;
    const gross = b.earnings.reduce((a, e) => a + e.amount, 0);
    const net = gross - b.deductions.reduce((a, e) => a + e.amount, 0);
    const slip = await Payslip.findOneAndUpdate({ user: b.user, month: b.month }, { ...b, gross, net }, { upsert: true, returnDocument: 'after' });
    if (b.creditedAt) notify(b.user, { title: 'Salary credited', body: `Your salary for ${b.month} (INR ${net.toLocaleString('en-IN')}) has been credited.`, type: 'salary' });
    res.status(201).json(slip);
  },
);

/* ---------------------------- Document vault & KYC ---------------------------- */

r.get('/documents', async (req, res) => {
  const scope = await userScopeFilter(req.user, req.query.user || req.user._id);
  res.json({ items: await Document.find(scope).sort({ createdAt: -1 }).populate('file', 'originalName mimeType size') });
});

r.post(
  '/documents',
  validate(
    z.object({
      user: objectId.optional(), // admins issue documents to employees
      category: z.enum(['offer_letter', 'appointment_letter', 'id_proof', 'address_proof', 'kyc_pan', 'kyc_aadhaar', 'education', 'policy', 'other']),
      title: z.string().min(1),
      file: objectId,
    }),
  ),
  async (req, res) => {
    const b = req.valid.body;
    const target = b.user && isAdmin(req.user) ? b.user : req.user._id;
    const file = await File.findById(b.file);
    if (!file || (String(file.owner) !== String(req.user._id) && !isAdmin(req.user))) throw forbidden('Invalid file');
    const issued = isAdmin(req.user) && String(target) !== String(req.user._id);
    const doc = await Document.create({ ...b, user: target, issuedByCompany: issued, status: issued ? 'verified' : 'pending', uploadedBy: req.user._id });
    if (issued) notify(target, { title: 'New document', body: `${b.title} has been added to your document vault`, type: 'system' });
    res.status(201).json(doc);
  },
);

r.post(
  '/documents/:id/verify',
  authorize(ADMINS),
  validate(z.object({ status: z.enum(['verified', 'rejected']), remarks: z.string().optional() })),
  async (req, res) => {
    const doc = await Document.findByIdAndUpdate(req.params.id, req.valid.body, { returnDocument: 'after' });
    if (!doc) throw notFound();
    res.json(doc);
  },
);

/** KYC submission: identity numbers are encrypted at rest; files go to the vault. */
r.post(
  '/kyc',
  validate(
    z.object({
      pan: z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Invalid PAN').optional(),
      aadhaar: z.string().regex(/^\d{12}$/, 'Aadhaar must be 12 digits').optional(),
      bank: z.object({ accountNo: z.string().min(6), ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC'), bankName: z.string().optional() }).optional(),
      panFile: objectId.optional(),
      aadhaarFile: objectId.optional(),
    }),
  ),
  async (req, res) => {
    const b = req.valid.body;
    const user = await User.findById(req.user._id);
    if (b.pan) user.kyc.pan = b.pan;
    if (b.aadhaar) user.kyc.aadhaar = b.aadhaar;
    if (b.bank) user.bank = b.bank;
    user.kyc.status = 'pending';
    await user.save();
    const docs = [
      b.panFile && { category: 'kyc_pan', title: 'PAN Card', file: b.panFile },
      b.aadhaarFile && { category: 'kyc_aadhaar', title: 'Aadhaar Card', file: b.aadhaarFile },
    ].filter(Boolean);
    for (const d of docs) await Document.create({ ...d, user: user._id, uploadedBy: user._id });
    res.json({ kyc: user.toPublic().kyc });
  },
);

r.post(
  '/kyc/:userId/review',
  authorize(ADMINS),
  validate(z.object({ status: z.enum(['verified', 'rejected']), remarks: z.string().optional() })),
  async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) throw notFound();
    user.kyc.status = req.valid.body.status;
    user.kyc.remarks = req.valid.body.remarks;
    await user.save();
    notify(user._id, { title: `KYC ${req.valid.body.status}`, body: req.valid.body.remarks || '', type: 'system' });
    res.json({ kyc: user.toPublic().kyc });
  },
);

export default r;
