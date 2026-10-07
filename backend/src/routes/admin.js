import { Router } from 'express';
import { z } from 'zod';
import { ADMINS, EMPLOYEE_ROLES, PARTNER_ROLES } from '../config/roles.js';
import { authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AuditLog, Distributor, Geofence, RefreshToken, Territory, User } from '../models/index.js';
import { notify } from '../services/messaging.js';
import { badRequest, escapeRegex, forbidden, notFound, paged } from '../utils/http.js';

const r = Router();
r.use(authorize(ADMINS));

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const audit = (req, action, entity, entityId, meta) => AuditLog.create({ actor: req.user._id, action, entity, entityId: String(entityId), meta });

/* ------------------------------- Users ------------------------------- */

const userSchema = z.object({
  name: z.string().min(2),
  mobile: z.string().regex(/^\+?\d{10,13}$/, 'Invalid mobile'),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  userType: z.enum(['employee', 'partner']),
  role: z.enum([...EMPLOYEE_ROLES, ...PARTNER_ROLES]),
  employeeCode: z.string().optional(),
  manager: objectId.nullable().optional(),
  territory: objectId.nullable().optional(),
  distributor: objectId.optional(),
  profile: z.object({ designation: z.string().optional(), department: z.string().optional(), address: z.string().optional(), dateOfJoining: z.coerce.date().optional() }).optional(),
  officeHours: z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/), workingDays: z.array(z.string()).optional() }).optional(),
  travelMode: z.enum(['bike', 'car', 'public']).optional(),
  salary: z.object({ basic: z.number(), hra: z.number().optional(), allowances: z.number().optional(), deductions: z.number().optional() }).optional(),
});

function checkRoleConsistency(b, actor) {
  if (b.userType === 'employee' && b.role && !EMPLOYEE_ROLES.includes(b.role)) throw badRequest('Invalid role for employee');
  if (b.userType === 'partner' && b.role && !PARTNER_ROLES.includes(b.role)) throw badRequest('Invalid role for partner');
  if (b.userType === 'partner' && !b.distributor) throw badRequest('Partner users must be linked to a distributor');
  if (b.role === 'super_admin' && actor.role !== 'super_admin') throw forbidden('Only super admin can create super admins');
}

r.get('/users', async (req, res) => {
  const filter = {};
  for (const k of ['userType', 'role', 'manager', 'territory', 'distributor']) if (req.query[k]) filter[k] = req.query[k];
  if (req.query.blocked) filter.isBlocked = req.query.blocked === 'true';
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i');
    filter.$or = [{ name: rx }, { mobile: rx }, { email: rx }, { employeeCode: rx }];
  }
  const result = await paged(User, filter, req.query, { sort: { name: 1 }, populate: [{ path: 'manager', select: 'name' }, { path: 'distributor', select: 'name code' }, { path: 'territory', select: 'name' }] });
  result.items = result.items.map((u) => u.toPublic());
  res.json(result);
});

r.get('/users/:id', async (req, res) => {
  const u = await User.findById(req.params.id).populate('manager', 'name').populate('distributor', 'name code').populate('territory', 'name');
  if (!u) throw notFound();
  res.json(u.toPublic());
});

r.post('/users', validate(userSchema), async (req, res) => {
  const { password, ...b } = req.valid.body;
  checkRoleConsistency(b, req.user);
  if (b.distributor && !(await Distributor.exists({ _id: b.distributor }))) throw badRequest('Distributor not found');
  const u = new User(b);
  if (password) await u.setPassword(password);
  await u.save();
  await audit(req, 'user.create', 'User', u._id, { role: u.role });
  res.status(201).json(u.toPublic());
});

r.patch('/users/:id', validate(userSchema.partial()), async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) throw notFound();
  const { password, ...b } = req.valid.body;
  checkRoleConsistency({ userType: u.userType, distributor: u.distributor, ...b }, req.user);
  if (u.role === 'super_admin' && req.user.role !== 'super_admin') throw forbidden();
  if (b.manager && String(b.manager) === String(u._id)) throw badRequest('User cannot report to themselves');
  const { profile, officeHours, salary, ...rest } = b;
  Object.assign(u, rest);
  if (profile) Object.assign(u.profile, profile);
  if (officeHours) u.officeHours = { ...u.officeHours.toObject(), ...officeHours };
  if (salary) u.salary = salary;
  if (password) {
    await u.setPassword(password);
    u.tokenVersion += 1;
  }
  await u.save();
  await audit(req, 'user.update', 'User', u._id, Object.keys(req.valid.body));
  res.json(u.toPublic());
});

/** Block / reactivate. Blocking revokes all sessions immediately. */
r.post('/users/:id/block', validate(z.object({ blocked: z.boolean(), reason: z.string().optional() })), async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) throw notFound();
  if (String(u._id) === String(req.user._id)) throw badRequest('You cannot block yourself');
  if (u.role === 'super_admin' && req.user.role !== 'super_admin') throw forbidden();
  u.isBlocked = req.valid.body.blocked;
  u.blockedReason = req.valid.body.blocked ? req.valid.body.reason : undefined;
  if (u.isBlocked) {
    u.tokenVersion += 1;
    await RefreshToken.updateMany({ user: u._id, revokedAt: null }, { revokedAt: new Date() });
  }
  await u.save();
  await audit(req, u.isBlocked ? 'user.block' : 'user.unblock', 'User', u._id, { reason: req.valid.body.reason });
  res.json(u.toPublic());
});

r.post('/users/:id/force-logout', async (req, res) => {
  const u = await User.findByIdAndUpdate(req.params.id, { $inc: { tokenVersion: 1 } }, { returnDocument: 'after' });
  if (!u) throw notFound();
  await RefreshToken.updateMany({ user: u._id, revokedAt: null }, { revokedAt: new Date() });
  await audit(req, 'user.forceLogout', 'User', u._id);
  res.json({ ok: true });
});

/* ------------------------- Territories & geofences ------------------------- */

const territorySchema = z.object({ name: z.string().min(1), code: z.string().min(1), region: z.string().optional(), description: z.string().optional() });
r.get('/territories', async (_req, res) => res.json({ items: await Territory.find().sort({ name: 1 }) }));
r.post('/territories', validate(territorySchema), async (req, res) => res.status(201).json(await Territory.create(req.valid.body)));
r.patch('/territories/:id', validate(territorySchema.partial()), async (req, res) => {
  const t = await Territory.findByIdAndUpdate(req.params.id, req.valid.body, { returnDocument: 'after' });
  if (!t) throw notFound();
  res.json(t);
});
r.delete('/territories/:id', async (req, res) => {
  if (await User.exists({ territory: req.params.id })) throw badRequest('Territory has users assigned');
  await Territory.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

const geofenceSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['office', 'territory', 'client']).default('office'),
  center: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  radiusM: z.number().min(25).max(50_000).default(200),
  territory: objectId.optional(),
  users: z.array(objectId).default([]),
  enforce: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
r.get('/geofences', async (_req, res) => res.json({ items: await Geofence.find().populate('territory', 'name').populate('users', 'name').sort({ name: 1 }) }));
r.post('/geofences', validate(geofenceSchema), async (req, res) => {
  const g = await Geofence.create(req.valid.body);
  await audit(req, 'geofence.create', 'Geofence', g._id);
  res.status(201).json(g);
});
r.patch('/geofences/:id', validate(geofenceSchema.partial()), async (req, res) => {
  const g = await Geofence.findByIdAndUpdate(req.params.id, req.valid.body, { returnDocument: 'after' });
  if (!g) throw notFound();
  res.json(g);
});
r.delete('/geofences/:id', async (req, res) => {
  await Geofence.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

/* --------------------------- Broadcast notifications --------------------------- */

r.post(
  '/broadcast',
  validate(
    z.object({
      title: z.string().min(2),
      body: z.string().min(2),
      type: z.enum(['announcement', 'target', 'attendance', 'salary', 'system']).default('announcement'),
      audience: z.object({
        userType: z.enum(['employee', 'partner']).optional(),
        roles: z.array(z.string()).optional(),
        territory: objectId.optional(),
        users: z.array(objectId).optional(),
      }).default({}),
    }),
  ),
  async (req, res) => {
    const { title, body, type, audience } = req.valid.body;
    const filter = { isBlocked: false };
    if (audience.users?.length) filter._id = { $in: audience.users };
    if (audience.userType) filter.userType = audience.userType;
    if (audience.roles?.length) filter.role = { $in: audience.roles };
    if (audience.territory) filter.territory = audience.territory;
    const ids = await User.find(filter).distinct('_id');
    await notify(ids, { title, body, type });
    await audit(req, 'broadcast', 'Notification', '-', { title, recipients: ids.length, audience });
    res.json({ recipients: ids.length });
  },
);

r.get('/audit-logs', async (req, res) => res.json(await paged(AuditLog, {}, req.query, { populate: { path: 'actor', select: 'name' } })));

export default r;
