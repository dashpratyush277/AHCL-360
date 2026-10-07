import { useState } from 'react';
import { Badge, Button, Card, Chips, Empty, Input, ListItem, Screen, Section, useBusy } from '../../components/ui';
import { api } from '../../lib/api';
import { date, label } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { pickAttachment } from '../../lib/pickers';

const CATEGORIES = ['id_proof', 'address_proof', 'education', 'other'];

/** Official document vault: HR-issued documents + employee uploads. */
export default function Documents() {
  const docs = useApi('/hr/documents');
  const [category, setCategory] = useState('id_proof');
  const [title, setTitle] = useState('');
  const [run, busy] = useBusy();

  const upload = () =>
    run(async () => {
      const assets = await pickAttachment();
      if (!assets.length) return;
      const [file] = await api.upload(assets.slice(0, 1), 'document');
      await api.post('/hr/documents', { category, title: title || label(category), file: file.id });
      setTitle('');
      docs.reload();
    });

  const open = (d) => run(() => api.downloadAndShare(`/files/${d.file?._id || d.file}?download=1`, d.file?.originalName || `${d.title}.pdf`));

  const items = docs.data?.items || [];
  return (
    <Screen onRefresh={docs.reload} refreshing={docs.loading}>
      <Section title="Issued by company">
        {items.filter((d) => d.issuedByCompany).map((d) => (
          <ListItem key={d._id} icon="ribbon-outline" title={d.title} subtitle={`${label(d.category)} · ${date(d.createdAt)}`} onPress={() => open(d)} />
        ))}
        {!items.some((d) => d.issuedByCompany) && <Empty loading={docs.loading} text="No documents issued yet." />}
      </Section>
      <Section title="My uploads">
        {items.filter((d) => !d.issuedByCompany).map((d) => (
          <ListItem key={d._id} icon="document-attach-outline" title={d.title} subtitle={label(d.category)} right={<Badge status={d.status} />} onPress={() => open(d)} />
        ))}
      </Section>
      <Card title="Upload a document">
        <Chips options={CATEGORIES} value={category} onChange={setCategory} />
        <Input label="Title" value={title} onChangeText={setTitle} placeholder={label(category)} />
        <Button title="Choose file & upload" icon="cloud-upload-outline" loading={busy} onPress={upload} />
      </Card>
    </Screen>
  );
}
