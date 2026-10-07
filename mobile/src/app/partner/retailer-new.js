import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Button, Card, Input, KV, ListItem, Screen, T, useBusy } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { pickAttachment } from '../../lib/pickers';
import { currentPosition } from '../../lib/tracking';

export default function RetailerNew() {
  const { user } = useAuth();
  const [f, setF] = useState({ name: '', shopName: '', mobile: '', email: '', address: '', city: '', pincode: '', pan: '', aadhaar: '', gstin: '' });
  const [loc, setLoc] = useState(null);
  const [files, setFiles] = useState({});
  const [run, busy] = useBusy();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  const attach = (key) =>
    run(async () => {
      const assets = await pickAttachment();
      if (!assets.length) return;
      const [file] = await api.upload(assets.slice(0, 1), 'kyc');
      setFiles((x) => ({ ...x, [key]: file }));
    });

  const submit = () =>
    run(async () => {
      const r = await api.post('/retailers', {
        name: f.name,
        shopName: f.shopName || undefined,
        contact: { mobile: f.mobile, email: f.email || undefined },
        address: f.address || undefined,
        city: f.city || undefined,
        pincode: f.pincode || undefined,
        location: loc ? { lat: loc.lat, lng: loc.lng } : undefined,
        kyc: {
          pan: f.pan || undefined,
          aadhaar: f.aadhaar || undefined,
          gstin: f.gstin || undefined,
          panFile: files.pan?.id,
          aadhaarFile: files.aadhaar?.id,
          gstFile: files.gst?.id,
        },
      });
      Alert.alert('Retailer added', `Linked to distributor code ${r.distributorCode}.`);
      router.back();
    });

  return (
    <Screen>
      <Card title="Retailer details">
        <Input label="Owner name *" value={f.name} onChangeText={set('name')} />
        <Input label="Shop name" value={f.shopName} onChangeText={set('shopName')} />
        <Input label="Mobile *" value={f.mobile} onChangeText={set('mobile')} keyboardType="phone-pad" maxLength={13} />
        <Input label="Email" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
        <Input label="Address" value={f.address} onChangeText={set('address')} multiline />
        <Input label="City" value={f.city} onChangeText={set('city')} />
        <Input label="PIN code" value={f.pincode} onChangeText={set('pincode')} keyboardType="number-pad" maxLength={6} />
        <ListItem icon={loc ? 'checkmark-circle' : 'locate-outline'} title={loc ? `GPS ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : 'Capture shop GPS location'} subtitle="Stand at the shop and tap" onPress={() => run(async () => setLoc(await currentPosition()))} />
      </Card>
      <Card title="KYC">
        <Input label="PAN" value={f.pan} onChangeText={(v) => set('pan')(v.toUpperCase())} autoCapitalize="characters" maxLength={10} />
        <ListItem icon={files.pan ? 'checkmark-circle' : 'attach'} title={files.pan?.name || 'Upload PAN'} onPress={() => attach('pan')} />
        <Input label="Aadhaar" value={f.aadhaar} onChangeText={(v) => set('aadhaar')(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={12} />
        <ListItem icon={files.aadhaar ? 'checkmark-circle' : 'attach'} title={files.aadhaar?.name || 'Upload Aadhaar'} onPress={() => attach('aadhaar')} />
        <Input label="GSTIN" value={f.gstin} onChangeText={(v) => set('gstin')(v.toUpperCase())} autoCapitalize="characters" maxLength={15} />
        <ListItem icon={files.gst ? 'checkmark-circle' : 'attach'} title={files.gst?.name || 'Upload GST certificate'} onPress={() => attach('gst')} />
      </Card>
      <Card>
        <KV k="Distributor code" v={user?.distributor?.code || 'Auto-linked'} />
        <T muted size={12}>The retailer is linked to your distributor code automatically.</T>
        <Button title="Save retailer" loading={busy} disabled={!f.name || f.mobile.length < 10} onPress={submit} />
      </Card>
    </Screen>
  );
}
