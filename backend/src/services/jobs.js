import { Attendance, User } from '../models/index.js';
import { dayKey } from '../utils/dates.js';
import { hmToMinutes } from '../utils/geo.js';
import { notify } from './messaging.js';

/**
 * Lightweight in-process scheduler (runs every minute).
 * - Attendance reminder 10 min after office start for employees not checked in
 * - Check-out reminder at office end for employees still checked in
 * For multi-instance deployments move these to a single worker / cloud scheduler.
 */
const sent = new Set();

function nowInIst() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return { minutes: Number(get('hour')) * 60 + Number(get('minute')), weekday: get('weekday') };
}

async function tick() {
  const { minutes, weekday } = nowInIst();
  const today = dayKey();
  const employees = await User.find({ userType: 'employee', isBlocked: false, 'officeHours.workingDays': weekday }).select('officeHours').lean();
  const attendance = await Attendance.find({ date: today }).select('user checkIn checkOut').lean();
  const att = new Map(attendance.map((a) => [String(a.user), a]));

  const remindIn = [];
  const remindOut = [];
  for (const e of employees) {
    const a = att.get(String(e._id));
    const key = `${today}:${e._id}`;
    if (minutes === hmToMinutes(e.officeHours.start) + 10 && !a?.checkIn?.time && !sent.has(`in:${key}`)) {
      remindIn.push(e._id);
      sent.add(`in:${key}`);
    }
    if (minutes === hmToMinutes(e.officeHours.end) && a?.checkIn?.time && !a?.checkOut?.time && !sent.has(`out:${key}`)) {
      remindOut.push(e._id);
      sent.add(`out:${key}`);
    }
  }
  if (remindIn.length) await notify(remindIn, { title: 'Attendance reminder', body: "You haven't checked in yet today.", type: 'attendance' });
  if (remindOut.length) await notify(remindOut, { title: 'Check-out reminder', body: 'Office hours are over. Remember to check out.', type: 'attendance' });
  if (sent.size > 50_000) sent.clear();
}

export function startJobs() {
  if (process.env.DISABLE_JOBS === 'true') return;
  setInterval(() => tick().catch((e) => console.error('[jobs]', e.message)), 60_000).unref();
}
