import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Chips, Input, Screen, T, useBusy } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { today } from '../../lib/format';

const REPORTS = [
  ['daily-work', 'Daily Work Summary'],
  ['expense', 'Expense Report'],
  ['visit-route', 'Visit Route Report'],
  ['attendance', 'Attendance Report'],
  ['sales', 'Daily Sales Orders'],
];

export default function Reports() {
  const { user } = useAuth();
  const [from, setFrom] = useState(`${today().slice(0, 8)}01`);
  const [to, setTo] = useState(today());
  const [scope, setScope] = useState('me');
  const [run, busy] = useBusy();

  const download = (type, format) =>
    run(() => api.downloadAndShare(`/reports/${type}${qs({ from, to, format, team: scope === 'team' ? 1 : undefined })}`, `${type}-${from}-to-${to}.${format}`));

  return (
    <Screen>
      <Card>
        <Input label="From (YYYY-MM-DD)" value={from} onChangeText={setFrom} />
        <Input label="To (YYYY-MM-DD)" value={to} onChangeText={setTo} />
        {user?.role === 'manager' && <Chips label="Scope" options={[['me', 'Only me'], ['team', 'My team']]} value={scope} onChange={setScope} />}
      </Card>
      {REPORTS.map(([type, title]) => (
        <Card key={type}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T weight="700" style={{ flex: 1 }}>{title}</T>
            <Button small variant="soft" title="PDF" disabled={busy} onPress={() => download(type, 'pdf')} />
            <Button small variant="ghost" title="Excel" disabled={busy} onPress={() => download(type, 'xlsx')} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
