import { useEffect } from 'react';
import { Badge, Button, Empty, ListItem, Screen } from '../../components/ui';
import { api } from '../../lib/api';
import { dt, label } from '../../lib/format';
import { useApi } from '../../lib/hooks';

const ICON = { order: 'cube-outline', claim: 'pricetags-outline', attendance: 'time-outline', salary: 'cash-outline', target: 'trophy-outline', announcement: 'megaphone-outline', leave: 'calendar-outline', expense: 'wallet-outline', report: 'document-text-outline' };

export default function Notifications() {
  const list = useApi('/notifications?limit=50');
  const unread = list.data?.unread;

  // Mark as read shortly after opening.
  useEffect(() => {
    if (!unread) return;
    const t = setTimeout(() => api.post('/notifications/read', {}).catch(() => {}), 1500);
    return () => clearTimeout(t);
  }, [unread]);

  return (
    <Screen onRefresh={list.reload} refreshing={list.loading}>
      {unread > 0 && <Button small variant="ghost" title="Mark all as read" onPress={() => api.post('/notifications/read', {}).then(list.reload)} />}
      {(list.data?.items || []).map((n) => (
        <ListItem key={n._id} icon={ICON[n.type] || 'notifications-outline'} title={n.title} subtitle={`${n.body || ''}\n${dt(n.createdAt)}`} right={!n.read ? <Badge status="pending" text="New" /> : <Badge status="closed" text={label(n.type)} />} />
      ))}
      {!list.data?.items?.length && <Empty loading={list.loading} text="You're all caught up." />}
    </Screen>
  );
}
