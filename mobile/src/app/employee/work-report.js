import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Badge, Button, Card, Input, ListItem, Screen, Section, T, useBusy } from '../../components/ui';
import { api } from '../../lib/api';
import { date, today } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { submitOrQueue } from '../../lib/offline';

export default function WorkReport() {
  const mine = useApi('/team/work-reports?limit=10');
  const [summary, setSummary] = useState('');
  const [tasks, setTasks] = useState('');
  const [plannedTomorrow, setPlanned] = useState('');
  const [challenges, setChallenges] = useState('');
  const [run, busy] = useBusy();

  const submit = () =>
    run(async () => {
      const payload = { date: today(), summary, tasksCompleted: tasks.split('\n').map((s) => s.trim()).filter(Boolean), plannedTomorrow: plannedTomorrow || undefined, challenges: challenges || undefined };
      const r = await submitOrQueue('workReport.submit', payload, (p) => api.post('/team/work-reports', p));
      Alert.alert(r.queued ? 'Saved offline' : 'Report submitted', r.queued ? 'It will sync when you are online.' : 'Your manager has been notified.');
      router.back();
    });

  return (
    <Screen>
      <Card title={`Report for ${date(today())}`}>
        <Input label="Summary of the day" value={summary} onChangeText={setSummary} multiline />
        <Input label="Tasks completed (one per line)" value={tasks} onChangeText={setTasks} multiline />
        <Input label="Plan for tomorrow" value={plannedTomorrow} onChangeText={setPlanned} multiline />
        <Input label="Challenges / support needed" value={challenges} onChangeText={setChallenges} multiline />
        <T muted size={12}>Visits, distance and sales for the day are attached automatically.</T>
        <Button title="Submit report" loading={busy} disabled={summary.trim().length < 5} onPress={submit} />
      </Card>
      <Section title="Previous reports">
        {(mine.data?.items || []).map((r) => (
          <ListItem
            key={r._id}
            title={date(r.date)}
            subtitle={[r.summary, ...(r.comments || []).map((c) => `💬 ${c.by?.name}: ${c.text}`)].join('\n')}
            right={<Badge status={r.status} />}
          />
        ))}
      </Section>
    </Screen>
  );
}
