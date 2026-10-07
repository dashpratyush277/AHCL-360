import { Badge, Empty, ListItem, Screen } from '../../components/ui';
import { date, label, today } from '../../lib/format';
import { useApi } from '../../lib/hooks';

export default function Holidays() {
  const { data, loading, reload } = useApi(`/hr/holidays?year=${today().slice(0, 4)}`);
  const now = today();
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      {(data?.items || []).map((h) => (
        <ListItem
          key={h._id}
          icon={h.date < now ? 'checkmark-done-outline' : 'sunny-outline'}
          title={h.name}
          subtitle={`${date(h.date)} · ${new Date(h.date).toLocaleDateString('en-IN', { weekday: 'long' })}${h.region ? ` · ${h.region}` : ''}`}
          right={<Badge status={h.date < now ? 'closed' : 'holiday'} text={label(h.type)} />}
        />
      ))}
      {!data?.items?.length && <Empty loading={loading} text="No holidays published yet." />}
    </Screen>
  );
}
