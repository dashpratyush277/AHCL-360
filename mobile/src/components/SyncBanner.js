import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { onQueueChange } from '../lib/offline';
import { useTheme } from '../theme';

/** Shows how many offline entries are waiting to sync (or failed). */
export default function SyncBanner() {
  const t = useTheme();
  const [q, setQ] = useState({ pending: 0, failed: [] });
  useEffect(() => onQueueChange(setQ), []);
  if (!q.pending && !q.failed.length) return null;
  const failed = q.failed.length;
  return (
    <Pressable onPress={() => router.push('/common/sync')} style={{ backgroundColor: failed ? t.badSoft : t.warnSoft, padding: 12, borderRadius: 10 }}>
      <Text style={{ color: failed ? t.bad : t.warn, fontWeight: '600' }}>
        {q.pending ? `${q.pending} entr${q.pending === 1 ? 'y' : 'ies'} saved offline – will sync when online. ` : ''}
        {failed ? `${failed} could not sync. Tap to review.` : ''}
      </Text>
    </Pressable>
  );
}
