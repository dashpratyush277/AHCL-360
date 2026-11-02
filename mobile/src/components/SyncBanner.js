import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { dt } from '../lib/format';
import { onQueueChange } from '../lib/offline';
import { useTheme } from '../theme';

/** Always-visible sync status: waiting / failed / synced counts and the last successful sync. */
export default function SyncBanner() {
  const t = useTheme();
  const [q, setQ] = useState({ pending: 0, failed: [], synced: 0 });
  useEffect(() => onQueueChange(setQ), []);
  const failed = q.failed.length;
  const tone = failed ? { bg: t.badSoft, fg: t.bad, icon: 'alert-circle' } : q.pending ? { bg: t.warnSoft, fg: t.warn, icon: 'cloud-upload' } : { bg: t.okSoft, fg: t.ok, icon: 'checkmark-circle' };
  const text = failed
    ? `${failed} entr${failed === 1 ? 'y' : 'ies'} could not sync – tap to review${q.pending ? ` · ${q.pending} waiting` : ''}`
    : q.pending
      ? `${q.pending} entr${q.pending === 1 ? 'y' : 'ies'} saved offline – will sync automatically when online`
      : `All data synced${q.lastSyncAt ? ` · last synced ${dt(q.lastSyncAt)}` : ''}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${text}`}
      onPress={() => router.push('/common/sync')}
      style={{ backgroundColor: tone.bg, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      <Ionicons name={tone.icon} size={18} color={tone.fg} />
      <Text style={{ color: tone.fg, fontWeight: '600', flex: 1, fontSize: 13 }}>{text}</Text>
    </Pressable>
  );
}
