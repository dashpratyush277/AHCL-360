import { router } from 'expo-router';
import { useState } from 'react';
import { Linking } from 'react-native';
import { Badge, Button, Chips, Empty, Input, ListItem, Screen } from '../../../components/ui';
import { qs } from '../../../lib/api';
import { useApi } from '../../../lib/hooks';

export default function Retailers() {
  const [q, setQ] = useState('');
  const [kycStatus, setKyc] = useState('');
  const [sort, setSort] = useState('name');
  const list = useApi(`/retailers${qs({ q, kycStatus, sort, limit: 100 })}`);
  return (
    <Screen onRefresh={list.reload} refreshing={list.loading}>
      <Button title="Onboard new retailer" icon="person-add-outline" onPress={() => router.push('/partner/retailer-new')} />
      <Input placeholder="Search name, shop, mobile, city…" value={q} onChangeText={setQ} />
      <Chips options={[['', 'Any KYC'], 'pending', 'verified', 'rejected']} value={kycStatus} onChange={setKyc} />
      <Chips options={[['name', 'A–Z'], ['-createdAt', 'Newest'], ['city', 'City']]} value={sort} onChange={setSort} />
      {(list.data?.items || []).map((r) => (
        <ListItem
          key={r._id}
          icon="storefront-outline"
          title={r.shopName || r.name}
          subtitle={`${r.name} · ${r.contact?.mobile}${r.city ? ` · ${r.city}` : ''}`}
          right={<Badge status={r.kyc?.status || 'pending'} text={`KYC ${r.kyc?.status || 'pending'}`} />}
          onPress={() => r.contact?.mobile && Linking.openURL(`tel:${r.contact.mobile}`)}
        />
      ))}
      {!list.data?.items?.length && <Empty loading={list.loading} text="No retailers found." />}
    </Screen>
  );
}
