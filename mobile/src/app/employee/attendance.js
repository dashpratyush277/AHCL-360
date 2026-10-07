import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Badge, Button, Card, KV, Row, Screen, T, useBusy } from '../../components/ui';
import { api } from '../../lib/api';
import { thisMonth, time } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { useTheme } from '../../theme';

export default function Attendance() {
  const t = useTheme();
  const { user } = useLocalSearchParams();
  const [month, setMonth] = useState(thisMonth());
  const { data, reload, loading } = useApi(`/attendance/month?month=${month}${user ? `&user=${user}` : ''}`);
  const [run, busy] = useBusy();

  const shift = (n) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 15);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const download = () => run(() => api.downloadAndShare(`/attendance/report?month=${month}&format=pdf${user ? `&user=${user}` : ''}`, `Attendance-${month}.pdf`));

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Button small variant="ghost" icon="chevron-back" onPress={() => shift(-1)} />
        <T weight="700">{month}</T>
        <Button small variant="ghost" icon="chevron-forward" disabled={month >= thisMonth()} onPress={() => shift(1)} />
      </Row>
      {data && (
        <Card title="Summary" right={<Button small variant="soft" icon="download-outline" title="PDF" loading={busy} onPress={download} />}>
          {Object.entries(data.summary).map(([k, v]) => <KV key={k} k={k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())} v={v} />)}
        </Card>
      )}
      {(data?.days || []).filter((d) => d.status !== 'upcoming').reverse().map((d) => (
        <View key={d.date} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border }}>
          <View style={{ width: 54 }}>
            <T weight="700">{d.date.slice(8)}</T>
            <T muted size={12}>{d.weekday}</T>
          </View>
          <View style={{ flex: 1 }}>
            <T size={13}>{d.checkIn ? `${time(d.checkIn)} – ${time(d.checkOut)}` : d.holiday || '—'}</T>
            {d.workMinutes > 0 && <T muted size={12}>{(d.workMinutes / 60).toFixed(1)} h · {d.distanceKm} km</T>}
          </View>
          <Badge status={d.status} />
        </View>
      ))}
    </Screen>
  );
}
