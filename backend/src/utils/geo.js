const R = 6371; // Earth radius, km
const toRad = (d) => (d * Math.PI) / 180;

/** Great-circle distance between two {lat, lng} points in kilometres. */
export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Total distance along a GPS trail, ignoring noisy fixes.
 * - points with poor accuracy (> maxAccuracyM) are dropped
 * - jitter below minStepM is ignored (device standing still)
 * - impossible jumps (> maxSpeedKmh) are treated as GPS glitches
 */
export function pathDistanceKm(points, { maxAccuracyM = 100, minStepM = 15, maxSpeedKmh = 150 } = {}) {
  const clean = points
    .filter((p) => p.lat != null && p.lng != null && (p.accuracy == null || p.accuracy <= maxAccuracyM))
    .sort((x, y) => new Date(x.recordedAt) - new Date(y.recordedAt));
  let total = 0;
  let last = clean[0];
  for (let i = 1; i < clean.length; i++) {
    const p = clean[i];
    const d = haversineKm(last, p);
    if (d * 1000 < minStepM) continue;
    const hours = (new Date(p.recordedAt) - new Date(last.recordedAt)) / 3_600_000;
    if (hours > 0 && d / hours > maxSpeedKmh) continue;
    total += d;
    last = p;
  }
  return Math.round(total * 100) / 100;
}

export function withinRadius(point, center, radiusM) {
  return haversineKm(point, center) * 1000 <= radiusM;
}

/** "HH:mm" -> minutes since midnight */
export const hmToMinutes = (hm) => {
  const [h, m] = String(hm).split(':').map(Number);
  return h * 60 + (m || 0);
};

export function isWithinOfficeHours(officeHours, date = new Date(), tz = 'Asia/Kolkata') {
  if (!officeHours?.start || !officeHours?.end) return true;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const day = get('weekday');
  if (officeHours.workingDays && !officeHours.workingDays.includes(day)) return false;
  const now = Number(get('hour')) * 60 + Number(get('minute'));
  return now >= hmToMinutes(officeHours.start) && now <= hmToMinutes(officeHours.end);
}
