import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { randomUUID } from 'expo-crypto';
import { api, getSession } from './api';

/**
 * Offline mode: when a write fails because the network is down, it is queued here and
 * replayed through POST /sync as soon as connectivity returns. Every op carries a
 * client-generated id so the server applies it exactly once.
 */
const QUEUE_KEY = 'ahcl_offline_queue_v1';
const FAILED_KEY = 'ahcl_offline_failed_v1';
const STATS_KEY = 'ahcl_sync_stats_v1'; // { synced: number, lastSyncAt: ISO }
const listeners = new Set();
let flushing = false;

const read = async (k) => JSON.parse((await AsyncStorage.getItem(k)) || '[]');
const write = (k, v) => AsyncStorage.setItem(k, JSON.stringify(v));
const readStats = async () => JSON.parse((await AsyncStorage.getItem(STATS_KEY)) || '{"synced":0}');

/** Record a successful round-trip to the server (online save or offline upload). */
async function markSynced(count = 0) {
  const s = await readStats();
  await AsyncStorage.setItem(STATS_KEY, JSON.stringify({ synced: s.synced + count, lastSyncAt: new Date().toISOString() }));
}

async function emit() {
  const [queue, failed, stats] = await Promise.all([read(QUEUE_KEY), read(FAILED_KEY), readStats()]);
  listeners.forEach((l) => l({ pending: queue.length, failed, synced: stats.synced, lastSyncAt: stats.lastSyncAt }));
}
export function onQueueChange(fn) {
  listeners.add(fn);
  emit();
  return () => listeners.delete(fn);
}

export async function enqueue(type, payload) {
  const queue = await read(QUEUE_KEY);
  const clientId = payload.clientId || randomUUID();
  queue.push({ clientId, type, payload: { ...payload, clientId }, createdAt: new Date().toISOString() });
  await write(QUEUE_KEY, queue);
  emit();
  return clientId;
}

/**
 * Try the online call; on network failure queue it as a sync op.
 * Returns { queued: true } or { queued: false, result }.
 */
export async function submitOrQueue(type, payload, online) {
  const withId = { ...payload, clientId: payload.clientId || randomUUID() };
  try {
    const result = await online(withId);
    markSynced(0).then(emit);
    return { queued: false, clientId: withId.clientId, result };
  } catch (e) {
    if (!e.isNetwork) throw e;
    await enqueue(type, withId);
    return { queued: true, clientId: withId.clientId };
  }
}

export async function flushQueue() {
  if (flushing || !getSession()) return;
  flushing = true;
  try {
    let queue = await read(QUEUE_KEY);
    while (queue.length) {
      const batch = queue.slice(0, 50);
      const { results } = await api.post('/sync', { ops: batch });
      const failed = await read(FAILED_KEY);
      const done = new Set();
      for (const r of results) {
        if (r.status === 'error' && r.retry) continue; // server error: keep for next attempt
        done.add(r.clientId);
        if (r.status === 'error') failed.push({ ...batch.find((b) => b.clientId === r.clientId), error: r.error });
      }
      await write(FAILED_KEY, failed.slice(-50));
      queue = (await read(QUEUE_KEY)).filter((op) => !done.has(op.clientId));
      await write(QUEUE_KEY, queue);
      await markSynced(results.filter((r) => r.status === 'ok' || r.status === 'duplicate').length);
      if (done.size === 0) break;
    }
  } catch {
    /* still offline - try again later */
  } finally {
    flushing = false;
    emit();
  }
}

export async function clearFailed() {
  await write(FAILED_KEY, []);
  emit();
}

/** Recovery path for a permanently failed entry: send it again (new id) or discard it. */
export async function retryFailed(clientId) {
  const failed = await read(FAILED_KEY);
  const item = failed.find((f) => f.clientId === clientId);
  if (!item) return;
  await write(FAILED_KEY, failed.filter((f) => f.clientId !== clientId));
  const { error: _e, clientId: _old, ...op } = item;
  await enqueue(op.type, { ...op.payload, clientId: randomUUID() });
  flushQueue();
}
export async function discardFailed(clientId) {
  await write(FAILED_KEY, (await read(FAILED_KEY)).filter((f) => f.clientId !== clientId));
  emit();
}

let unsubscribe;
export function startAutoSync() {
  unsubscribe?.();
  unsubscribe = NetInfo.addEventListener((s) => {
    if (s.isConnected && s.isInternetReachable !== false) flushQueue();
  });
  flushQueue();
}

/* ---- Current client visit, remembered on the device so it can be checked out offline ---- */

const VISIT_KEY = 'ahcl_current_visit_v1';

/** visit: { ref, clientId, clientName, purpose, time } – ref is the server id or 'client:<clientId>' */
export const saveCurrentVisit = (visit) => AsyncStorage.setItem(VISIT_KEY, JSON.stringify(visit));
export const clearCurrentVisit = () => AsyncStorage.removeItem(VISIT_KEY);
export async function getCurrentVisit() {
  try {
    return JSON.parse((await AsyncStorage.getItem(VISIT_KEY)) || 'null');
  } catch {
    return null;
  }
}
export async function pendingOps() {
  return read(QUEUE_KEY);
}
