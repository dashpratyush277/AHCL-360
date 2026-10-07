import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Button, Card, Chips, Input, ListItem, Screen, useBusy } from '../../components/ui';
import { api } from '../../lib/api';
import { pickAttachment } from '../../lib/pickers';

/** New scheme/discount claim, or revision of one sent back (params.id). */
export default function ClaimNew() {
  const params = useLocalSearchParams();
  const revising = Boolean(params.id);
  const [type, setType] = useState('scheme');
  const [schemeName, setScheme] = useState('');
  const [amount, setAmount] = useState(params.amount || '');
  const [description, setDescription] = useState(params.description || '');
  const [files, setFiles] = useState([]);
  const [run, busy] = useBusy();

  const attach = () =>
    run(async () => {
      const assets = await pickAttachment();
      if (assets.length) setFiles([...files, ...(await api.upload(assets, 'claim'))]);
    });

  const submit = () =>
    run(async () => {
      const attachments = files.map((f) => f.id);
      if (revising) {
        await api.patch(`/claims/${params.id}`, { amount: Number(amount), description: description || undefined, ...(attachments.length ? { attachments } : {}) });
      } else {
        await api.post('/claims', { type, schemeName: schemeName || undefined, amount: Number(amount), description: description || undefined, attachments });
      }
      Alert.alert(revising ? 'Claim resubmitted' : 'Claim submitted', 'You will be notified when it is reviewed.');
      router.back();
    });

  return (
    <Screen>
      <Card>
        {!revising && <Chips label="Claim type" options={['scheme', 'discount', 'damage', 'transport', 'other']} value={type} onChange={setType} />}
        {!revising && ['scheme', 'discount'].includes(type) && <Input label="Scheme name" value={schemeName} onChangeText={setScheme} />}
        <Input label="Claim amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <Input label="Description" value={description} onChangeText={setDescription} multiline />
        <ListItem icon="attach" title={`Supporting bills / images: ${files.length}`} onPress={attach} />
        <Button title={revising ? 'Resubmit claim' : 'Submit claim'} loading={busy} disabled={!Number(amount)} onPress={submit} />
      </Card>
    </Screen>
  );
}
