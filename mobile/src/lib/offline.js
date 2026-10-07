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
const listeners = new Set();
let flushing = false;

const read = async (k) => JSON.parse((await AsyncStorage.getItem(k)) || '[]');
const write = (k, v) => AsyncStorage.setItem(k, JSON.stringify(v));

async function emit() {
  const [queue, failed] = await Promise.all([read(QUEUE_KEY), read(FAILED_KEY)]);
  listeners.forEach((l) => l({ pending: queue.length, failed }));
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
    return { queued: false, result: await online(withId) };
  } catch (e) {
    if (!e.isNetwork) throw e;
    await enqueue(type, withId);
    return { queued: true };
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

let unsubscribe;
export function startAutoSync() {
  unsubscribe?.();
  unsubscribe = NetInfo.addEventListener((s) => {
    if (s.isConnected && s.isInternetReachable !== false) flushQueue();
  });
  flushQueue();
}
