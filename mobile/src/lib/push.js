import { isRunningInExpoGo } from 'expo';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from './api';

/**
 * expo-notifications throws on import inside Expo Go on Android (remote push was removed
 * from Expo Go in SDK 53), so it is loaded lazily and only outside Expo Go.
 * In-app notifications (the Notifications screen) work everywhere; device push needs a
 * development or store build.
 */
let Notifications = null;
function loadNotifications() {
  if (isRunningInExpoGo()) return null;
  if (!Notifications) {
    Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }),
    });
  }
  return Notifications;
}

/** Registers the device's native FCM/APNs token with the backend. No-op in Expo Go. */
export async function registerForPush() {
  try {
    const N = loadNotifications();
    if (!N || !Device.isDevice) return null;
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', { name: 'General', importance: N.AndroidImportance.HIGH });
    }
    const { status } = await N.requestPermissionsAsync();
    if (status !== 'granted') return null;
    const { data: token } = await N.getDevicePushTokenAsync();
    await api.post('/auth/fcm-token', { token });
    return token;
  } catch (e) {
    console.log('[push] not registered:', e.message);
    return null;
  }
}
