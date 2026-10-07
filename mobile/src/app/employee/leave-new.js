import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Button, Card, Chips, Input, Screen, T, useBusy } from '../../components/ui';
import { api } from '../../lib/api';
import { today } from '../../lib/format';

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export default function LeaveNew() {
  const [type, setType] = useState('casual');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [run, busy] = useBusy();

  const submit = () =>
    run(async () => {
      await api.post('/hr/leaves', { type, from, to: halfDay ? from : to, halfDay, reason });
      Alert.alert('Leave applied', 'Your manager has been notified.');
      router.back();
    });

  return (
    <Screen>
      <Card>
        <Chips label="Leave type" options={['casual', 'sick', 'earned', 'unpaid', 'other']} value={type} onChange={setType} />
        <Chips label="Duration" options={[[false, 'Full day(s)'], [true, 'Half day']]} value={halfDay} onChange={setHalfDay} />
        <Input label="From (YYYY-MM-DD)" value={from} onChangeText={setFrom} error={from && !isDate(from) ? 'Use YYYY-MM-DD' : undefined} />
        {!halfDay && <Input label="To (YYYY-MM-DD)" value={to} onChangeText={setTo} error={to && !isDate(to) ? 'Use YYYY-MM-DD' : to < from ? 'Must be on or after From' : undefined} />}
        <Input label="Reason" value={reason} onChangeText={setReason} multiline />
        <T muted size={12}>Status will show as Pending until your manager approves or rejects it.</T>
        <Button title="Submit request" loading={busy} disabled={!isDate(from) || (!halfDay && (!isDate(to) || to < from)) || reason.length < 3} onPress={submit} />
      </Card>
    </Screen>
  );
}
