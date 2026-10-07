export const inr = (n) => (n == null ? '-' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);

export const date = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
export const time = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-');
export const dt = (d) => (d ? `${date(d)}, ${time(d)}` : '-');

/** YYYY-MM-DD in IST */
export const today = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export const thisMonth = () => today().slice(0, 7);

export const label = (s) => (s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '-');
