import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Card, Empty, KV, Screen } from '../../components/ui';
import { time, today } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { useTheme } from '../../theme';

/** Route map history for a day (own or, for managers, a junior via ?user=). */
export default function RouteMap() {
  const t = useTheme();
  const { date = today(), user } = useLocalSearchParams();
  const { data, loading, error } = useApi(`/tracking/route?date=${date}${user ? `&user=${user}` : ''}`);
  const pts = (data?.points || []).map((p) => ({ latitude: p.lat, longitude: p.lng }));
  const visits = data?.visits || [];
  const first = pts[0] || (visits[0] && { latitude: visits[0].checkIn.lat, longitude: visits[0].checkIn.lng });

  return (
    <Screen>
      <Card>
        <KV k="Date" v={date} />
        <KV k="Distance" v={`${data?.distanceKm ?? 0} km`} />
        <KV k="GPS points" v={pts.length} />
        <KV k="Visits" v={visits.length} />
      </Card>
      {first ? (
        <View style={{ height: 420, borderRadius: 12, overflow: 'hidden' }}>
          <MapView style={{ flex: 1 }} initialRegion={{ ...first, latitudeDelta: 0.08, longitudeDelta: 0.08 }}>
            {pts.length > 1 && <Polyline coordinates={pts} strokeColor={t.info} strokeWidth={4} />}
            {visits.map((v, i) => (
              <Marker key={v._id} coordinate={{ latitude: v.checkIn.lat, longitude: v.checkIn.lng }} title={`${i + 1}. ${v.clientName}`} description={`${v.purpose} · ${time(v.checkIn.time)}`} pinColor={v.locationValid ? 'green' : 'red'} />
            ))}
          </MapView>
        </View>
      ) : (
        <Empty loading={loading} error={error} text="No GPS data for this day." />
      )}
    </Screen>
  );
}
