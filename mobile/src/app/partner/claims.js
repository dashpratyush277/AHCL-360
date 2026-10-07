import { router } from 'expo-router';
import { useState } from 'react';
import { Badge, Button, Card, Chips, Empty, KV, Screen, T } from '../../components/ui';
import { qs } from '../../lib/api';
import { date, inr, label } from '../../lib/format';
import { useApi } from '../../lib/hooks';

export default function Claims() {
  const [status, setStatus] = useState('');
  const list = useApi(`/claims${qs({ status, limit: 50 })}`);
  return (
    <Screen onRefresh={list.reload} refreshing={list.loading}>
      <Button title="Submit new claim" icon="add" onPress={() => router.push('/partner/claim-new')} />
      <Chips options={[['', 'All'], 'pending', 'revision_requested', 'approved', 'settled', 'rejected']} value={status} onChange={setStatus} />
      {(list.data?.items || []).map((c) => {
        const last = c.history?.[c.history.length - 1];
        return (
          <Card key={c._id} title={c.claimNo} right={<Badge status={c.status} />}>
            <KV k="Type" v={`${label(c.type)}${c.schemeName ? ` · ${c.schemeName}` : ''}`} />
            <KV k="Claimed" v={inr(c.amount)} />
            {c.approvedAmount != null && <KV k="Approved" v={inr(c.approvedAmount)} />}
            <KV k="Submitted" v={date(c.createdAt)} />
            {last?.note ? <T muted size={13}>Note: {last.note}</T> : null}
            {c.status === 'revision_requested' && (
              <Button small variant="soft" title="Revise & resubmit" onPress={() => router.push({ pathname: '/partner/claim-new', params: { id: c._id, amount: String(c.amount), description: c.description || '' } })} />
            )}
          </Card>
        );
      })}
      {!list.data?.items?.length && <Empty loading={list.loading} text="No claims submitted yet." />}
    </Screen>
  );
}
