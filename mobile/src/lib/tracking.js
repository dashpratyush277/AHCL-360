import AsyncStorage from '@react-native-async-storage/async-storage';
import { isRunningInExpoGo } from 'expo';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { api, getSession, loadSession } from './api';
import { enqueue } from './offline';

/**
 * GPS live tracking. A background location task records points while the employee is
 * checked in AND within office hours; it stops itself automatically after hours.
 * Points are buffered locally and uploaded in batches (or queued for offline sync).
 */
export const TRACKING_TASK = 'ahcl-location-tracking';
const BUFFER_KEY = 'ahcl_gps_buffer';
const CONFIG_KEY = 'ahcl_tracking_config';

const hm = (s) => {
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + (m || 0);
};

export function withinOfficeHours(officeHours, d = new Date()) {
  if (!officeHours?.start) return true;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  if (officeHours.workingDays && !officeHours.workingDays.includes(get('weekday'))) return false;
  const now = Number(get('hour')) * 60 + Number(get('minute'));
  return now >= hm(officeHours.start) && now <= hm(officeHours.end);
}

async function uploadBuffer(force = false) {
  const buf = JSON.parse((await AsyncStorage.getItem(BUFFER_KEY)) || '[]');
  if (!buf.length || (!force && buf.length < 5)) return;
  await AsyncStorage.setItem(BUFFER_KEY, '[]');
  try {
    if (!getSession()) await loadSession();
    await api.post('/tracking/pings', { points: buf });
  } catch (e) {
    if (e.isNetwork) await enqueue('tracking.pings', { points: buf });
  }
}

// Must be defined at module scope so it is registered when the JS bundle loads in the background.
TaskManager.defineTask(TRACKING_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const cfg = JSON.parse((await AsyncStorage.getItem(CONFIG_KEY)) || 'null');
  if (cfg && !withinOfficeHours(cfg.officeHours)) {
    await uploadBuffer(true);
    await Location.stopLocationUpdatesAsync(TRACKING_TASK).catch(() => {});
    return;
  }
  const buf = JSON.parse((await AsyncStorage.getItem(BUFFER_KEY)) || '[]');
  for (const l of data.locations) {
    buf.push({ lat: l.coords.latitude, lng: l.coords.longitude, accuracy: l.coords.accuracy, speed: l.coords.speed, recordedAt: new Date(l.timestamp).toISOString() });
  }
  await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(buf.slice(-2000)));
  await uploadBuffer();
});

export async function isTracking() {
  return Location.hasStartedLocationUpdatesAsync(TRACKING_TASK).catch(() => false);
}

/** Ask for foreground + background permission. Returns true if background tracking is allowed. */
export async function ensureLocationPermissions() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  const bg = await Location.requestBackgroundPermissionsAsync().catch(() => ({ status: 'denied' }));
  return bg.status === 'granted';
}

export async function currentPosition() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location permission is required');
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
}

/**
 * Start or stop background tracking based on server config (office hours) and attendance state.
 * Call on app foreground, after check-in and after check-out.
 */
export async function syncTracking({ checkedIn }) {
  let cfg;
  try {
    cfg = await api.get('/tracking/config');
    await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    cfg = JSON.parse((await AsyncStorage.getItem(CONFIG_KEY)) || 'null');
  }
  const shouldRun = Boolean(checkedIn && cfg && withinOfficeHours(cfg.officeHours));
  const running = await isTracking();

  if (shouldRun && !running) {
    if (isRunningInExpoGo() && Platform.OS === 'android') return { running: false, reason: 'Needs a development build (not available in Expo Go)' };
    if (!(await ensureLocationPermissions())) return { running: false, reason: 'Background location permission denied' };
    try {
      await startUpdates(cfg);
    } catch (e) {
      return { running: false, reason: `Could not start: ${e.message}` };
    }
    return { running: true };
  }
  if (!shouldRun && running) {
    await uploadBuffer(true);
    await Location.stopLocationUpdatesAsync(TRACKING_TASK);
    return { running: false, reason: checkedIn ? 'Outside office hours' : 'Not checked in' };
  }
  if (running) await uploadBuffer(true);
  return { running, reason: running ? undefined : checkedIn ? 'Outside office hours' : 'Not checked in' };
}

function startUpdates(cfg) {
  return Location.startLocationUpdatesAsync(TRACKING_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: (cfg.intervalSeconds || 60) * 1000,
    distanceInterval: cfg.distanceFilterM || 50,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'AHCL 360 is tracking your route',
      notificationBody: 'Location is recorded during office hours only.',
      notificationColor: '#0F6E4F',
    },
  });
}

export async function stopTracking() {
  if (await isTracking()) {
    await uploadBuffer(true);
    await Location.stopLocationUpdatesAsync(TRACKING_TASK);
  }
}
