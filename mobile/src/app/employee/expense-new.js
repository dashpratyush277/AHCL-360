import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Button, Card, Chips, Input, KV, ListItem, Screen, T, useBusy } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { inr, today } from '../../lib/format';
import { submitOrQueue } from '../../lib/offline';
import { pickAttachment } from '../../lib/pickers';

export default function ExpenseNew() {
  const { user } = useAuth();
  const [day, setDay] = useState(today());
  const [category, setCategory] = useState('travel');
  const [mode, setMode] = useState(user?.travelMode || 'bike');
  const [useGps, setUseGps] = useState(true);
  const [distanceKm, setDistanceKm] = useState('');
  const [amount, setAmount] = useState('');
  const [fromPlace, setFrom] = useState('');
  const [toPlace, setTo] = useState('');
  const [description, setDescription] = useState('');
  const [bills, setBills] = useState([]);
  const [estimate, setEstimate] = useState(null);
  const [run, busy] = useBusy();

  // Auto calculation preview from the GPS trail of the selected day.
  useEffect(() => {
    if (category !== 'travel' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    api.get(`/expenses/estimate?date=${day}&mode=${mode}`).then(setEstimate).catch(() => setEstimate(null));
  }, [day, mode, category]);

  const addBill = () =>
    run(async () => {
      const assets = await pickAttachment();
      if (!assets.length) return;
      const files = await api.upload(assets, 'bill');
      setBills((b) => [...b, ...files]);
    });

  const isTravelByDistance = category === 'travel' && mode !== 'public';
  const preview = isTravelByDistance ? (useGps ? estimate?.amount : Number(distanceKm || 0) * (estimate?.ratePerKm || 0)) : Number(amount || 0);

  const submit = () =>
    run(async () => {
      const payload = {
        date: day,
        category,
        travelMode: category === 'travel' ? mode : undefined,
        useGpsDistance: category === 'travel' && useGps,
        distanceKm: category === 'travel' && !useGps && distanceKm ? Number(distanceKm) : undefined,
        amount: !isTravelByDistance && amount ? Number(amount) : undefined,
        fromPlace: fromPlace || undefined,
        toPlace: toPlace || undefined,
        description: description || undefined,
        bills: bills.map((b) => b.id),
      };
      const r = await submitOrQueue('expense.create', payload, (p) => api.post('/expenses', p));
      Alert.alert(r.queued ? 'Saved offline' : 'Claim submitted', r.queued ? 'It will sync when you are online.' : `Amount ${inr(r.result.amount)} sent for approval.`);
      router.back();
    });

  return (
    <Screen>
      <Card>
        <Input label="Date (YYYY-MM-DD)" value={day} onChangeText={setDay} />
        <Chips label="Category" options={['travel', 'food', 'lodging', 'phone', 'other']} value={category} onChange={setCategory} />
        {category === 'travel' && (
          <>
            <Chips label="Travel mode" options={['bike', 'car', 'public']} value={mode} onChange={setMode} />
            <Chips label="Distance" options={[[true, 'Auto from GPS'], [false, 'Enter manually']]} value={useGps} onChange={setUseGps} />
            {useGps ? (
              <Card style={{ padding: 10 }}>
                <KV k="GPS distance" v={estimate ? `${estimate.distanceKm} km` : '…'} />
                <KV k="Rate" v={estimate ? `₹${estimate.ratePerKm}/km` : '…'} />
              </Card>
            ) : (
              <Input label="Distance (km)" value={distanceKm} onChangeText={setDistanceKm} keyboardType="decimal-pad" />
            )}
            <Input label="From" value={fromPlace} onChangeText={setFrom} />
            <Input label="To" value={toPlace} onChangeText={setTo} />
          </>
        )}
        {!isTravelByDistance && <Input label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />}
        <Input label="Description" value={description} onChangeText={setDescription} multiline />
        <ListItem icon="attach" title={`Bills attached: ${bills.length}`} subtitle="Photo or PDF" onPress={addBill} />
        <KV k="Claim amount" v={inr(preview || 0)} />
        {isTravelByDistance && <T muted size={12}>Amount = distance × company rate per km for your travel mode.</T>}
        <Button title="Submit claim" loading={busy} disabled={!isTravelByDistance && !amount} onPress={submit} />
      </Card>
    </Screen>
  );
}
