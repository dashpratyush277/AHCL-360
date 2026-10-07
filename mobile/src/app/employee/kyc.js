import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Badge, Button, Card, Input, KV, ListItem, Screen, T, useBusy } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { pickAttachment } from '../../lib/pickers';

export default function Kyc() {
  const { user, refreshUser } = useAuth();
  const [pan, setPan] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [files, setFiles] = useState({});
  const [run, busy] = useBusy();

  const attach = (key) =>
    run(async () => {
      const assets = await pickAttachment();
      if (!assets.length) return;
      const [f] = await api.upload(assets.slice(0, 1), 'kyc');
      setFiles((x) => ({ ...x, [key]: f }));
    });

  const submit = () =>
    run(async () => {
      await api.post('/hr/kyc', {
        pan: pan || undefined,
        aadhaar: aadhaar || undefined,
        bank: accountNo ? { accountNo, ifsc, bankName: bankName || undefined } : undefined,
        panFile: files.pan?.id,
        aadhaarFile: files.aadhaar?.id,
      });
      await refreshUser();
      Alert.alert('KYC submitted', 'HR will verify your details.');
      router.back();
    });

  return (
    <Screen>
      <Card title="Current status" right={<Badge status={user?.kyc?.status === 'not_submitted' ? 'closed' : user?.kyc?.status} />}>
        <KV k="PAN" v={user?.kyc?.pan || '-'} />
        <KV k="Aadhaar" v={user?.kyc?.aadhaar || '-'} />
        <KV k="Bank a/c" v={user?.bank?.accountNo || '-'} />
        {user?.kyc?.remarks ? <T muted size={12}>HR remarks: {user.kyc.remarks}</T> : null}
      </Card>
      <Card title="Update KYC">
        <Input label="PAN" value={pan} onChangeText={(v) => setPan(v.toUpperCase())} autoCapitalize="characters" maxLength={10} placeholder="ABCDE1234F" />
        <ListItem icon={files.pan ? 'checkmark-circle' : 'attach'} title={files.pan ? files.pan.name : 'Attach PAN card'} onPress={() => attach('pan')} />
        <Input label="Aadhaar number" value={aadhaar} onChangeText={(v) => setAadhaar(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={12} />
        <ListItem icon={files.aadhaar ? 'checkmark-circle' : 'attach'} title={files.aadhaar ? files.aadhaar.name : 'Attach Aadhaar card'} onPress={() => attach('aadhaar')} />
        <Input label="Bank account number" value={accountNo} onChangeText={setAccountNo} keyboardType="number-pad" />
        <Input label="IFSC" value={ifsc} onChangeText={(v) => setIfsc(v.toUpperCase())} autoCapitalize="characters" maxLength={11} />
        <Input label="Bank name" value={bankName} onChangeText={setBankName} />
        <T muted size={12}>Identity and bank numbers are encrypted before storage and shown masked.</T>
        <Button title="Submit KYC" loading={busy} disabled={!pan && !aadhaar && !accountNo} onPress={submit} />
      </Card>
    </Screen>
  );
}
