import { router } from 'expo-router';
import { useState } from 'react';
import { Button, Card, Chips, Input, ListItem, Screen, useBusy } from '../../components/ui';
import { api } from '../../lib/api';
import { pickAttachment } from '../../lib/pickers';

export default function TicketNew() {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('app');
  const [priority, setPriority] = useState('medium');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState([]);
  const [run, busy] = useBusy();

  const submit = () =>
    run(async () => {
      const t = await api.post('/support/tickets', { subject, category, priority, message, attachments: files.map((f) => f.id) });
      router.replace(`/common/ticket/${t._id}`);
    });

  return (
    <Screen>
      <Card>
        <Input label="Subject" value={subject} onChangeText={setSubject} />
        <Chips label="Category" options={['app', 'order', 'payment', 'hr', 'claim', 'other']} value={category} onChange={setCategory} />
        <Chips label="Priority" options={['low', 'medium', 'high']} value={priority} onChange={setPriority} />
        <Input label="Describe the issue" value={message} onChangeText={setMessage} multiline />
        <ListItem icon="attach" title={`Screenshots / files: ${files.length}`} onPress={() => run(async () => { const a = await pickAttachment(); if (a.length) setFiles([...files, ...(await api.upload(a, 'ticket'))]); })} />
        <Button title="Submit ticket" loading={busy} disabled={subject.length < 3 || message.length < 3} onPress={submit} />
      </Card>
    </Screen>
  );
}
