import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { ADMINS, isAdmin } from '../config/roles.js';
import { authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Notification, Ticket, User, nextNumber } from '../models/index.js';
import { notify } from '../services/messaging.js';
import { notFound, paged } from '../utils/http.js';

const r = Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i);

/* -------------------------------- Profile -------------------------------- */

r.patch(
  '/profile',
  validate(
    z.object({
      name: z.string().min(2).optional(),
      email: z.string().email().optional(),
      profile: z.object({ address: z.string().optional(), photo: objectId.optional() }).optional(),
      travelMode: z.enum(['bike', 'car', 'public']).optional(),
    }),
  ),
  async (req, res) => {
    const u = await User.findById(req.user._id);
    const { profile, ...rest } = req.valid.body;
    Object.assign(u, rest);
    if (profile) Object.assign(u.profile, profile);
    await u.save();
    res.json({ user: u.toPublic() });
  },
);

/* ----------------------------- Notifications ----------------------------- */

r.get('/notifications', async (req, res) => {
  const filter = { user: req.user._id, ...(req.query.unread ? { read: false } : {}) };
  const [result, unread] = await Promise.all([paged(Notification, filter, req.query), Notification.countDocuments({ user: req.user._id, read: false })]);
  res.json({ ...result, unread });
});

r.post('/notifications/read', validate(z.object({ ids: z.array(objectId).optional() })), async (req, res) => {
  const filter = { user: req.user._id, ...(req.valid.body.ids ? { _id: { $in: req.valid.body.ids } } : {}) };
  await Notification.updateMany(filter, { read: true });
  res.json({ ok: true });
});

/* ------------------------------ Support ------------------------------ */

r.get('/support/contact', (_req, res) => res.json({ phone: env.company.supportPhone, email: env.company.supportEmail, hours: 'Mon-Sat, 9:30 AM - 6:30 PM' }));

r.post(
  '/support/tickets',
  validate(z.object({ subject: z.string().min(3), category: z.enum(['app', 'order', 'payment', 'hr', 'claim', 'other']).default('other'), priority: z.enum(['low', 'medium', 'high']).default('medium'), message: z.string().min(3), attachments: z.array(objectId).default([]) })),
  async (req, res) => {
    const b = req.valid.body;
    const ticket = await Ticket.create({
      ticketNo: await nextNumber('TKT', { fiscal: false }),
      user: req.user._id,
      subject: b.subject,
      category: b.category,
      priority: b.priority,
      messages: [{ from: req.user._id, text: b.message, attachments: b.attachments }],
    });
    notify(await User.find({ role: { $in: ADMINS } }).distinct('_id'), { title: 'New support ticket', body: `${ticket.ticketNo}: ${ticket.subject}`, type: 'system', data: { id: String(ticket._id) } });
    res.status(201).json(ticket);
  },
);

r.get('/support/tickets', async (req, res) => {
  const filter = isAdmin(req.user) && req.query.all ? {} : { user: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  res.json(await paged(Ticket, filter, req.query, { sort: { updatedAt: -1 }, populate: { path: 'user', select: 'name mobile userType' } }));
});

r.get('/support/tickets/:id', async (req, res) => {
  const t = await Ticket.findOne({ _id: req.params.id, ...(isAdmin(req.user) ? {} : { user: req.user._id }) }).populate('messages.from', 'name role').populate('user', 'name mobile');
  if (!t) throw notFound();
  res.json(t);
});

r.post('/support/tickets/:id/messages', validate(z.object({ text: z.string().min(1), attachments: z.array(objectId).default([]) })), async (req, res) => {
  const t = await Ticket.findOne({ _id: req.params.id, ...(isAdmin(req.user) ? {} : { user: req.user._id }) });
  if (!t) throw notFound();
  t.messages.push({ from: req.user._id, ...req.valid.body });
  if (isAdmin(req.user) && t.status === 'open') t.status = 'in_progress';
  if (!isAdmin(req.user) && t.status === 'resolved') t.status = 'open';
  await t.save();
  if (isAdmin(req.user)) notify(t.user, { title: `Reply on ${t.ticketNo}`, body: req.valid.body.text.slice(0, 120), type: 'system', data: { id: String(t._id) } });
  res.json(t);
});

r.post('/support/tickets/:id/status', authorize(ADMINS), validate(z.object({ status: z.enum(['open', 'in_progress', 'resolved', 'closed']) })), async (req, res) => {
  const t = await Ticket.findByIdAndUpdate(req.params.id, { status: req.valid.body.status, assignedTo: req.user._id }, { returnDocument: 'after' });
  if (!t) throw notFound();
  notify(t.user, { title: `Ticket ${t.ticketNo} ${t.status.replace('_', ' ')}`, type: 'system' });
  res.json(t);
});

export default r;
