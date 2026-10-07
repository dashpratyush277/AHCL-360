import { Button, Empty, ListItem, Screen, useBusy } from '../../components/ui';
import { api } from '../../lib/api';
import { date, inr } from '../../lib/format';
import { useApi } from '../../lib/hooks';

export default function Invoices() {
  const list = useApi('/invoices?limit=100');
  const [run, busy] = useBusy();
  return (
    <Screen onRefresh={list.reload} refreshing={list.loading}>
      {(list.data?.items || []).map((i) => (
        <ListItem
          key={i._id}
          icon="document-text-outline"
          title={i.invoiceNo}
          subtitle={`${date(i.issuedAt)} · ${inr(i.grandTotal)} · ${i.interState ? 'IGST' : 'CGST+SGST'}${i.order ? ` · ${i.order.orderNo}` : ''}`}
          right={<Button small variant="soft" icon="download-outline" disabled={busy} onPress={() => run(() => api.downloadAndShare(`/invoices/${i._id}/pdf`, `${i.invoiceNo}.pdf`))} />}
        />
      ))}
      {!list.data?.items?.length && <Empty loading={list.loading} text="No invoices yet. Invoices are generated when an order is packed." />}
    </Screen>
  );
}
