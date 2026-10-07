import { Router } from 'express';
import { z } from 'zod';
import { MANAGERS } from '../config/roles.js';
import { authorize, requireUserType } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { LocationPing, User, Visit } from '../models/index.js';
import { trail } from '../services/tracking.js';
import { dayKey, dayRange } from '../utils/dates.js';
import { isWithinOfficeHours, pathDistanceKm } from '../utils/geo.js';
import { userScopeFilter } from '../utils/scope.js';

const r = Router();
r.use(requireUserType('employee'));

/** App polls this to auto start/stop background tracking with office hours. */
r.get('/config', (req, res) => {
  res.json({
    officeHours: req.user.officeHours,
    trackingActive: isWithinOfficeHours(req.user.officeHours),
    intervalSeconds: 60,
    distanceFilterM: 50,
  });
});

const pingsSchema = z.object({
  points: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracy: z.number().optional(),
        speed: z.number().nullable().optional(),
        battery: z.number().optional(),
        recordedAt: z.coerce.date(),
      }),
    )
    .min(1)
    .max(1000),
});

export async function savePings(user, points) {
  // Only store points recorded within office hours (tracking is a work-time feature).
  const allowed = points.filter((p) => isWithinOfficeHours(user.officeHours, p.recordedAt));
  if (allowed.length) await LocationPing.insertMany(allowed.map((p) => ({ ...p, user: user._id })), { ordered: false });
  return { accepted: allowed.length, ignored: points.length - allowed.length };
}

/** Batch upload of GPS points (background task / offline buffer). */
r.post('/pings', validate(pingsSchema), async (req, res) => res.json(await savePings(req.user, req.valid.body.points)));

/** Route map history: ?user=&date=YYYY-MM-DD */
r.get('/route', async (req, res) => {
  const filter = await userScopeFilter(req.user, req.query.user || req.user._id);
  const date = req.query.date || dayKey();
  const { start, end } = dayRange(date);
  const [points, visits] = await Promise.all([
    trail(filter.user, start, end),
    Visit.find({ user: filter.user, date }).select('clientName purpose checkIn checkOut distanceKm locationValid').sort({ 'checkIn.time': 1 }).lean(),
  ]);
  res.json({ date, distanceKm: pathDistanceKm(points), points, visits });
});

/** Live location of team members (last ping in the past 30 min). */
r.get('/live', authorize(MANAGERS), async (req, res) => {
  const filter = await userScopeFilter(req.user);
  const since = new Date(Date.now() - 30 * 60_000);
  const match = { recordedAt: { $gte: since }, ...(filter.user ? { user: filter.user } : {}) };
  const latest = await LocationPing.aggregate([
    { $match: match },
    { $sort: { recordedAt: -1 } },
    { $group: { _id: '$user', lat: { $first: '$lat' }, lng: { $first: '$lng' }, recordedAt: { $first: '$recordedAt' }, battery: { $first: '$battery' }, speed: { $first: '$speed' } } },
  ]);
  const users = await User.find({ _id: { $in: latest.map((l) => l._id) } }).select('name employeeCode role mobile').lean();
  const um = new Map(users.map((u) => [String(u._id), u]));
  res.json({ items: latest.map((l) => ({ user: um.get(String(l._id)), lat: l.lat, lng: l.lng, recordedAt: l.recordedAt, battery: l.battery, speed: l.speed })) });
});

export default r;
