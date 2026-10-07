import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/**
 * API base URL. Set EXPO_PUBLIC_API_URL (e.g. http://192.168.1.10:4000/api) for a physical device.
 * Defaults: Android emulator -> 10.0.2.2, otherwise the Metro host's IP.
 */
function defaultBase() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:4000/api`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000/api' : 'http://localhost:4000/api';
}
export const API_URL = defaultBase();

const KEY = 'ahcl_session';
let session = null;
const listeners = new Set();

export const getSession = () => session;
export const onSessionChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export async function loadSession() {
  try {
    session = JSON.parse((await SecureStore.getItemAsync(KEY)) || 'null');
  } catch {
    session = null;
  }
  return session;
}

/** Tokens live in the device keystore (SecureStore), never in AsyncStorage. */
export async function setSession(s) {
  session = s;
  if (s) await SecureStore.setItemAsync(KEY, JSON.stringify(s));
  else await SecureStore.deleteItemAsync(KEY);
  listeners.forEach((l) => l(s));
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || (status === 0 ? 'Network unavailable' : `Request failed (${status})`));
    this.status = status;
    this.details = body?.details;
  }
  get isNetwork() {
    return this.status === 0;
  }
}

let refreshing = null;
async function refresh() {
  refreshing ??= (async () => {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: session?.refreshToken }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      // Refresh rejected (idle timeout, blocked, revoked) -> force logout
      await setSession(null);
      throw new ApiError(res.status, body);
    }
    await setSession({ ...session, ...body });
  })().finally(() => (refreshing = null));
  return refreshing;
}

async function request(method, path, body, retry = true) {
  const headers = { Accept: 'application/json' };
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers['content-type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0);
  }
  if (res.status === 401 && retry && session?.refreshToken && !path.startsWith('/auth/')) {
    await refresh();
    return request(method, path, body, false);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b) => request('PUT', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),

  /** Upload picked assets: [{ uri, name, mimeType }] */
  async upload(assets, purpose = 'other') {
    const fd = new FormData();
    for (const a of assets) fd.append('files', { uri: a.uri, name: a.name || a.fileName || `upload-${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg' });
    fd.append('purpose', purpose);
    const { files } = await request('POST', '/files', fd);
    return files;
  },

  /** Download an authenticated PDF/XLSX and open the share sheet. */
  async downloadAndShare(path, filename) {
    // Make sure the access token is fresh before handing it to the native downloader.
    await request('GET', '/auth/me');
    const dest = new File(Paths.cache, filename.replace(/[^\w.-]+/g, '_'));
    if (dest.exists) dest.delete();
    const file = await File.downloadFileAsync(`${API_URL}${path}`, dest, { headers: { Authorization: `Bearer ${session.accessToken}` } });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri);
    return file.uri;
  },
};

export const qs = (o) => {
  const parts = Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
};
