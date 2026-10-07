import { useState } from 'react';
import { View } from 'react-native';
import { Badge, Button, Card, Chips, Empty, Input, Screen, T, useBusy } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { date, inr } from '../../lib/format';
import { useApi } from '../../lib/hooks';

/** Manager: approve / comment on juniors' daily work reports. */
export default function TeamReports() {
  const [status, setStatus] = useState('submitted');
  const list = useApi(`/team/work-reports${qs({ scope: 'team', status, limit: 30 })}`);
  const [comments, setComments] = useState({});
  const [run, busy] = useBusy();

  const review = (r, body) =>
    run(async () => {
      await api.post(`/team/work-reports/${r._id}/review`, { ...body, comment: comments[r._id] || undefined });
      setComments((c) => ({ ...c, [r._id]: '' }));
      list.reload();
    });

  return (
    <Screen onRefresh={list.reload} refreshing={list.loading}>
      <Chips options={[['submitted', 'To review'], ['needs_changes', 'Needs changes'], ['approved', 'Approved']]} value={status} onChange={setStatus} />
      {(list.data?.items || []).map((r) => (
        <Card key={r._id} title={`${r.user?.name} · ${date(r.date)}`} right={<Badge status={r.status} />}>
          <T>{r.summary}</T>
          {r.tasksCompleted?.length > 0 && <T muted>• {r.tasksCompleted.join('\n• ')}</T>}
          <T muted size={12}>Visits {r.stats?.visits ?? 0} · {r.stats?.distanceKm ?? 0} km · Sales {inr(r.stats?.salesValue)}</T>
          {r.comments?.map((c, i) => <T key={i} size={13}>💬 {c.by?.name}: {c.text}</T>)}
          <Input placeholder="Add a comment…" value={comments[r._id] || ''} onChangeText={(v) => setComments((c) => ({ ...c, [r._id]: v }))} />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {r.status !== 'approved' && <Button small title="Approve" disabled={busy} onPress={() => review(r, { status: 'approved' })} />}
            {r.status !== 'needs_changes' && <Button small variant="soft" title="Needs changes" disabled={busy} onPress={() => review(r, { status: 'needs_changes' })} />}
            <Button small variant="ghost" title="Comment only" disabled={busy || !comments[r._id]} onPress={() => review(r, {})} />
          </View>
        </Card>
      ))}
      {!list.data?.items?.length && <Empty loading={list.loading} text="Nothing to review." />}
    </Screen>
  );
}
