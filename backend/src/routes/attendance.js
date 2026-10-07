import { Router } from 'express';
import { z } from 'zod';
import { MANAGERS } from '../config/roles.js';
import { authorize, requireUserType } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Attendance, Holiday, Leave, User } from '../models/index.js';
import { sendTableReport } from '../services/documents.js';
import { checkGeofence, dayDistanceKm } from '../services/tracking.js';
import { dayKey, monthKey, periodRange } from '../utils/dates.js';
import { badRequest, forbidden } from '../utils/http.js';
import { userScopeFilter } from '../utils/scope.js';

const r = Router();
r.use(requireUserType('employee'));

const punchSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
  time: z.coerce.date().optional(), // offline punches carry their original time
});

async function buildPunch(user, body) {
  const fence = await checkGeofence(user, body);
  if (fence.enforce && !fence.within) throw forbidden('You are outside the allowed location for attendance');
  return { time: body.time || new Date(), lat: body.lat, lng: body.lng, accuracy: body.accuracy, withinGeofence: fence.within, geofence: fence.geofence };
}

export async function checkIn(user, body) {
  const punch = await buildPunch(user, body);
  const date = dayKey(punch.time);
  const existing = await Attendance.findOne({ user: user._id, date });
  if (existing?.checkIn?.time) throw badRequest('Already checked in today');
  return Attendance.findOneAndUpdate(
    { user: user._id, date },
    { $set: { checkIn: punch, status: 'present' } },
    { upsert: true, returnDocument: 'after' },
  );
}

export async function checkOut(user, body) {
  const punch = await buildPunch(user, body);
  const date = dayKey(punch.time);
  const att = await Attendance.findOne({ user: user._id, date });
  if (!att?.checkIn?.time) throw badRequest('You have not checked in today');
  if (att.checkOut?.time) throw badRequest('Already checked out today');
  att.checkOut = punch;
  att.workMinutes = Math.round((punch.time - att.checkIn.time) / 60_000);
  att.status = att.workMinutes < 240 ? 'half_day' : 'present';
  att.distanceKm = await dayDistanceKm(user._id, date);
  return att.save();
}

r.post('/check-in', validate(punchSchema), async (req, res) => res.status(201).json(await checkIn(req.user, req.valid.body)));
r.post('/check-out', validate(punchSchema), async (req, res) => res.json(await checkOut(req.user, req.valid.body)));

r.get('/today', async (req, res) => {
  const att = await Attendance.findOne({ user: req.user._id, date: dayKey() });
  res.json({ date: dayKey(), attendance: att, officeHours: req.user.officeHours });
});

/** Monthly calendar: merges attendance, approved leaves and holidays. ?month=YYYY-MM&user= */
async function monthSheet(userId, month) {
  const { start, end } = periodRange(month);
  const [records, leaves, holidays] = await Promise.all([
    Attendance.find({ user: userId, date: { $regex: `^${month}` } }).lean(),
    Leave.find({ user: userId, status: 'approved', from: { $lte: `${month}-31` }, to: { $gte: `${month}-01` } }).lean(),
    Holiday.find({ date: { $regex: `^${month}` } }).lean(),
  ]);
  const byDate = new Map(records.map((a) => [a.date, a]));
  const holidayMap = new Map(holidays.map((h) => [h.date, h.name]));
  const days = [];
  const today = dayKey();
  for (let d = new Date(start); d < end; d = new Date(d.getTime() + 86_400_000)) {
    const key = dayKey(d);
    const a = byDate.get(key);
    const leave = leaves.find((l) => l.from <= key && l.to >= key);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(d);
    let status = a?.status;
    if (!status) status = holidayMap.has(key) ? 'holiday' : leave ? 'leave' : weekday === 'Sun' ? 'weekly_off' : key < today ? 'absent' : 'upcoming';
    days.push({ date: key, weekday, status, checkIn: a?.checkIn?.time, checkOut: a?.checkOut?.time, workMinutes: a?.workMinutes ?? 0, distanceKm: a?.distanceKm ?? 0, holiday: holidayMap.get(key), withinGeofence: a?.checkIn?.withinGeofence });
  }
  const count = (s) => days.filter((x) => x.status === s).length;
  return { month, days, summary: { present: count('present'), halfDay: count('half_day'), absent: count('absent'), leave: count('leave'), holidays: count('holiday'), weeklyOff: count('weekly_off') } };
}

r.get('/month', async (req, res) => {
  const filter = await userScopeFilter(req.user, req.query.user || req.user._id);
  res.json(await monthSheet(filter.user, req.query.month || monthKey()));
});

/** Monthly attendance report download. ?month=YYYY-MM&format=pdf|xlsx&user= */
r.get('/report', async (req, res) => {
  const filter = await userScopeFilter(req.user, req.query.user || req.user._id);
  const u = await User.findById(filter.user);
  const sheet = await monthSheet(u._id, req.query.month || monthKey());
  const t = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '-');
  await sendTableReport(res, {
    title: `Attendance Report - ${sheet.month}`,
    subtitle: `${u.name} (${u.employeeCode || u.mobile})`,
    format: req.query.format,
    columns: [
      { key: 'date', header: 'Date', width: 70 },
      { key: 'weekday', header: 'Day', width: 40 },
      { key: 'status', header: 'Status', width: 70 },
      { key: 'checkIn', header: 'In', width: 50, format: t },
      { key: 'checkOut', header: 'Out', width: 50, format: t },
      { key: 'hours', header: 'Hours', width: 45 },
      { key: 'distanceKm', header: 'Km', width: 45 },
      { key: 'holiday', header: 'Note', width: 90 },
    ],
    rows: sheet.days.map((d) => ({ ...d, hours: (d.workMinutes / 60).toFixed(1) })),
    summary: Object.entries(sheet.summary),
  });
});

/** Team attendance for a given day (managers/admins). */
r.get('/team', authorize(MANAGERS), async (req, res) => {
  const date = req.query.date || dayKey();
  const filter = await userScopeFilter(req.user);
  const users = await User.find({ userType: 'employee', isBlocked: false, ...(filter.user ? { _id: filter.user } : {}) }).select('name employeeCode role');
  const att = await Attendance.find({ date, user: { $in: users.map((u) => u._id) } }).lean();
  const map = new Map(att.map((a) => [String(a.user), a]));
  res.json({ date, items: users.map((u) => ({ user: u, attendance: map.get(String(u._id)) || null })) });
});

export default r;
