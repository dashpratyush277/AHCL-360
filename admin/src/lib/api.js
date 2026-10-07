// Thin fetch wrapper: attaches the access token, refreshes it once on 401, and
// logs the user out when the refresh token is rejected (blocked / idle timeout).

const BASE = import.meta.env.VITE_API_URL || '/api';
const KEY = 'ahcl_admin_session';

let session = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
})();
const listeners = new Set();

export const getSession = () => session;
export function setSession(s) {
  session = s;
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l(s));
}
export const onSessionChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));

let refreshing = null;
async function refresh() {
  if (!session?.refreshToken) throw new Error('No session');
  refreshing ??= fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  })
    .then(async (r) => {
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'Session expired');
      setSession({ ...session, ...body });
    })
    .catch((e) => {
      setSession(null);
      throw e;
    })
    .finally(() => (refreshing = null));
  return refreshing;
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.details = body?.details;
  }
}

async function request(method, path, body, { raw = false, retry = true } = {}) {
  const headers = {};
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers['content-type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, { method, headers, body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined });
  if (res.status === 401 && retry && session?.refreshToken && !path.startsWith('/auth/')) {
    await refresh();
    return request(method, path, body, { raw, retry: false });
  }
  if (raw) {
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
    return res;
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b) => request('PUT', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
  upload: (files, purpose = 'other') => {
    const fd = new FormData();
    [...files].forEach((f) => fd.append('files', f));
    fd.append('purpose', purpose);
    return request('POST', '/files', fd);
  },
  /** Download a protected file (PDF/XLSX) with auth headers and save it. */
  async download(path, fallbackName = 'download') {
    const res = await request('GET', path, undefined, { raw: true });
    const cd = res.headers.get('content-disposition') || '';
    const name = decodeURIComponent(/filename="?([^"]+)"?/.exec(cd)?.[1] || fallbackName);
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
  /** Open a protected file (image/PDF) in a new tab. */
  async open(path) {
    const res = await request('GET', path, undefined, { raw: true });
    window.open(URL.createObjectURL(await res.blob()), '_blank');
  },
};

export const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
