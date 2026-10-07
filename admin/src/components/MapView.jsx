import L from 'leaflet';
import { useEffect } from 'react';
import { Circle, CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';

// Default to Bhubaneswar (Odisha)
export const DEFAULT_CENTER = [20.2961, 85.8245];

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points?.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
    else if (points?.length === 1) map.setView(points[0], 14);
  }, [map, points]);
  return null;
}

function ClickHandler({ onClick }) {
  useMapEvents({ click: (e) => onClick?.({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/**
 * markers: [{ lat, lng, label, color }]
 * path: [[lat,lng]...]
 * circles: [{ lat, lng, radius, label }]
 */
export default function MapView({ markers = [], path, circles = [], onClick, fit = true, height }) {
  const pts = [...markers.map((m) => [m.lat, m.lng]), ...(path || []), ...circles.map((c) => [c.lat, c.lng])];
  return (
    <div className="map" style={height ? { height } : undefined}>
      <MapContainer center={pts[0] || DEFAULT_CENTER} zoom={12} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {fit && <FitBounds points={pts} />}
        <ClickHandler onClick={onClick} />
        {path?.length > 1 && <Polyline positions={path} pathOptions={{ color: '#2f80ed', weight: 3 }} />}
        {circles.map((c, i) => (
          <Circle key={i} center={[c.lat, c.lng]} radius={c.radius} pathOptions={{ color: c.color || '#0f6e4f', weight: 2, fillOpacity: 0.12 }}>
            {c.label && <Popup>{c.label}</Popup>}
          </Circle>
        ))}
        {markers.map((m, i) => (
          <CircleMarker key={i} center={[m.lat, m.lng]} radius={m.radius || 8} pathOptions={{ color: '#ffffff', weight: 2, fillColor: m.color || '#0f6e4f', fillOpacity: 1 }}>
            {m.label && <Popup>{m.label}</Popup>}
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
