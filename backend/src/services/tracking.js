import { Geofence, LocationPing } from '../models/index.js';
import { dayRange } from '../utils/dates.js';
import { pathDistanceKm, withinRadius } from '../utils/geo.js';

/** GPS points for a user between two dates. */
export const trail = (userId, from, to) =>
  LocationPing.find({ user: userId, recordedAt: { $gte: from, $lt: to } })
    .sort({ recordedAt: 1 })
    .select('lat lng accuracy speed recordedAt -_id')
    .lean();

export async function distanceBetween(userId, from, to) {
  return pathDistanceKm(await trail(userId, from, to));
}

export async function dayDistanceKm(userId, day) {
  const { start, end } = dayRange(day);
  return distanceBetween(userId, start, end);
}

/**
 * Check a point against the active geofences that apply to this user.
 * Returns { within, geofence, enforce } - `within` is true when no fence applies.
 */
export async function checkGeofence(user, point, kinds = ['office', 'territory']) {
  const fences = await Geofence.find({
    isActive: true,
    kind: { $in: kinds },
    $or: [{ users: { $size: 0 } }, { users: user._id }, ...(user.territory ? [{ territory: user.territory }] : [])],
  }).lean();
  if (!fences.length) return { within: true, geofence: null, enforce: false };
  const hit = fences.find((f) => withinRadius(point, f.center, f.radiusM));
  return { within: Boolean(hit), geofence: hit?.name ?? null, enforce: fences.some((f) => f.enforce) };
}
