const TZ = 'Asia/Kolkata';

/** YYYY-MM-DD in IST for the given date. */
export function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export const monthKey = (date = new Date()) => dayKey(date).slice(0, 7);

export function quarterKey(date = new Date()) {
  const [y, m] = dayKey(date).split('-').map(Number);
  return `${y}-Q${Math.ceil(m / 3)}`;
}

/** Start/end Date (IST day boundaries) for a YYYY-MM-DD key. */
export function dayRange(key) {
  const start = new Date(`${key}T00:00:00+05:30`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

/** Date range for a period key: 'YYYY-MM' or 'YYYY-Qn'. */
export function periodRange(key) {
  const q = /^(\d{4})-Q([1-4])$/.exec(key);
  if (q) {
    const y = Number(q[1]);
    const m = (Number(q[2]) - 1) * 3 + 1;
    const start = new Date(`${y}-${String(m).padStart(2, '0')}-01T00:00:00+05:30`);
    const endMonth = m + 3 > 12 ? `${y + 1}-01` : `${y}-${String(m + 3).padStart(2, '0')}`;
    return { start, end: new Date(`${endMonth}-01T00:00:00+05:30`) };
  }
  const [y, m] = key.split('-').map(Number);
  const start = new Date(`${key}-01T00:00:00+05:30`);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { start, end: new Date(`${next}-01T00:00:00+05:30`) };
}

/** Parse optional ?from=YYYY-MM-DD&to=YYYY-MM-DD into a Date range (default: current month). */
export function rangeFromQuery(q) {
  const from = q.from ? dayRange(q.from).start : periodRange(monthKey()).start;
  const to = q.to ? dayRange(q.to).end : new Date();
  return { from, to };
}

export function daysBetweenInclusive(from, to) {
  return Math.round((dayRange(to).start - dayRange(from).start) / 86_400_000) + 1;
}
