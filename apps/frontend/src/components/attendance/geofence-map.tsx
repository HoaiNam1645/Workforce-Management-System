'use client';

import { divIcon, latLng, type LeafletEvent } from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

type GeofenceMapProps = {
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  onPositionChange: (latitude: number, longitude: number) => void;
};

const DEFAULT_POSITION: [number, number] = [16.047079, 108.20623];
const TILE_PROVIDERS = [
  {
    url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  },
  {
    url: 'https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  },
  {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
];

export default function GeofenceMap({ latitude, longitude, radiusM, onPositionChange }: GeofenceMapProps) {
  const position = useMemo<[number, number]>(() => latitude !== null && longitude !== null ? [latitude, longitude] : DEFAULT_POSITION, [latitude, longitude]);
  const [tileProviderIndex, setTileProviderIndex] = useState(0);
  const tileProvider = TILE_PROVIDERS[tileProviderIndex];
  const markerIcon = useMemo(() => divIcon({
    className: 'geofence-marker-shell',
    iconSize: [38, 46],
    iconAnchor: [19, 43],
    html: '<div class="geofence-marker"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.15 7-13a7 7 0 1 0-14 0c0 6.85 7 13 7 13Z"/><circle cx="12" cy="9" r="2.6"/></svg></div>',
  }), []);

  return <MapContainer center={position} zoom={20} minZoom={3} maxZoom={21} scrollWheelZoom className="h-full min-h-80 w-full bg-canvas">
    <TileLayer key={tileProvider.url} attribution={tileProvider.attribution} url={tileProvider.url} maxNativeZoom={19} maxZoom={21} eventHandlers={{ tileerror: () => setTileProviderIndex((current) => Math.min(current + 1, TILE_PROVIDERS.length - 1)) }} />
    <MapClick onPositionChange={onPositionChange} />
    <MapViewport position={position} radiusM={radiusM} />
    {latitude !== null && longitude !== null && <Circle center={position} radius={radiusM} pathOptions={{ color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.2, weight: 2 }} />}
    <Marker
      position={position}
      icon={markerIcon}
      draggable
      eventHandlers={{ dragend: (event: LeafletEvent) => { const point = event.target.getLatLng(); onPositionChange(point.lat, point.lng); } }}
    />
  </MapContainer>;
}

function MapClick({ onPositionChange }: Pick<GeofenceMapProps, 'onPositionChange'>) {
  useMapEvents({ click: (event) => onPositionChange(event.latlng.lat, event.latlng.lng) });
  return null;
}

function MapViewport({ position, radiusM }: { position: [number, number]; radiusM: number }) {
  const map = useMap();
  useEffect(() => {
    const visibleDiameter = Math.max(radiusM * 2.15, 48);
    map.fitBounds(latLng(position[0], position[1]).toBounds(visibleDiameter), { padding: [20, 20], animate: true, maxZoom: 21 });
  }, [map, position, radiusM]);
  return null;
}
