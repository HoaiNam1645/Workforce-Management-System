'use client';

import { divIcon, latLng } from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';

type EmployeeLocationMapProps = {
  branchLatitude: number;
  branchLongitude: number;
  radiusM: number;
  employeeLatitude: number;
  employeeLongitude: number;
  accuracyM: number;
  withinGeofence: boolean;
};

const TILE_PROVIDERS = [
  { url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' },
  { url: 'https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' },
  { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri' },
];

export default function EmployeeLocationMap(props: EmployeeLocationMapProps) {
  const branchPosition = useMemo<[number, number]>(() => [props.branchLatitude, props.branchLongitude], [props.branchLatitude, props.branchLongitude]);
  const employeePosition = useMemo<[number, number]>(() => [props.employeeLatitude, props.employeeLongitude], [props.employeeLatitude, props.employeeLongitude]);
  const [tileProviderIndex, setTileProviderIndex] = useState(0);
  const tileProvider = TILE_PROVIDERS[tileProviderIndex];
  const branchIcon = useMemo(() => divIcon({
    className: 'geofence-marker-shell',
    iconSize: [34, 42],
    iconAnchor: [17, 39],
    html: '<div class="geofence-marker"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.15 7-13a7 7 0 1 0-14 0c0 6.85 7 13 7 13Z"/><circle cx="12" cy="9" r="2.6"/></svg></div>',
  }), []);

  return <MapContainer center={branchPosition} zoom={19} minZoom={3} maxZoom={21} scrollWheelZoom className="h-full min-h-64 w-full bg-canvas">
    <TileLayer key={tileProvider.url} attribution={tileProvider.attribution} url={tileProvider.url} maxNativeZoom={19} maxZoom={21} eventHandlers={{ tileerror: () => setTileProviderIndex((current) => Math.min(current + 1, TILE_PROVIDERS.length - 1)) }} />
    <MapViewport branchPosition={branchPosition} employeePosition={employeePosition} radiusM={props.radiusM} />
    <Circle center={branchPosition} radius={props.radiusM} pathOptions={{ color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.15, weight: 2 }} />
    <Marker position={branchPosition} icon={branchIcon}><Tooltip permanent={false} direction="top">Tâm khu vực chấm công</Tooltip></Marker>
    <Circle center={employeePosition} radius={Math.max(props.accuracyM, 1)} pathOptions={{ color: props.withinGeofence ? '#0b8f70' : '#d55757', fillColor: props.withinGeofence ? '#34d399' : '#f87171', fillOpacity: 0.12, weight: 1 }} />
    <CircleMarker center={employeePosition} radius={8} pathOptions={{ color: '#ffffff', fillColor: props.withinGeofence ? '#0b8f70' : '#d55757', fillOpacity: 1, weight: 3 }}><Tooltip permanent direction="top" offset={[0, -8]}>Vị trí của bạn</Tooltip></CircleMarker>
  </MapContainer>;
}

function MapViewport({ branchPosition, employeePosition, radiusM }: { branchPosition: [number, number]; employeePosition: [number, number]; radiusM: number }) {
  const map = useMap();
  useEffect(() => {
    const branchBounds = latLng(branchPosition[0], branchPosition[1]).toBounds(Math.max(radiusM * 2.3, 55));
    const bounds = branchBounds.extend(employeePosition);
    map.fitBounds(bounds, { padding: [34, 34], animate: true, maxZoom: 21 });
  }, [branchPosition, employeePosition, map, radiusM]);
  return null;
}
