'use client';

import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent, Marker } from 'maplibre-gl';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getMapStyle } from '@/lib/map-provider';
import { MapHost } from './map-host';

type GeofenceMapProps = {
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  onPositionChange: (latitude: number, longitude: number) => void;
};

const DEFAULT_POSITION: [number, number] = [108.20623, 16.047079];
maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

export default function GeofenceMap({ latitude, longitude, radiusM, onPositionChange }: GeofenceMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPositionChangeRef = useRef(onPositionChange);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryKey, setRetryKey] = useState(0);
  const longitudeValue = longitude ?? DEFAULT_POSITION[0];
  const latitudeValue = latitude ?? DEFAULT_POSITION[1];

  useEffect(() => {
    onPositionChangeRef.current = onPositionChange;
  }, [onPositionChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const mapStyle = getMapStyle();
    if (!mapStyle) {
      setMapStatus('error');
      return;
    }
    setMapStatus('loading');
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [longitudeValue, latitudeValue],
      zoom: 18,
      minZoom: 3,
      maxZoom: 21,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    const marker = new maplibregl.Marker({ element: createMarkerElement('#2563eb'), draggable: true })
      .setLngLat([longitudeValue, latitudeValue])
      .addTo(map);
    marker.on('dragend', () => {
      const point = marker.getLngLat();
      onPositionChangeRef.current(point.lat, point.lng);
    });
    map.on('click', (event: MapMouseEvent) => onPositionChangeRef.current(event.lngLat.lat, event.lngLat.lng));
    const loadTimeout = window.setTimeout(() => setMapStatus('error'), 12_000);
    map.on('load', () => {
      window.clearTimeout(loadTimeout);
      setMapStatus('ready');
      map.addSource('geofence', { type: 'geojson', data: circleFeature(latitudeValue, longitudeValue, radiusM) });
      map.addLayer({ id: 'geofence-fill', type: 'fill', source: 'geofence', paint: { 'fill-color': '#60a5fa', 'fill-opacity': 0.2 } });
      map.addLayer({ id: 'geofence-line', type: 'line', source: 'geofence', paint: { 'line-color': '#2563eb', 'line-width': 2 } });
      fitRadius(map, latitudeValue, longitudeValue, radiusM);
    });
    map.on('error', () => {
      if (!map.isStyleLoaded()) setMapStatus('error');
    });
    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      window.clearTimeout(loadTimeout);
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // The map is initialized once; later coordinate changes are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  useEffect(() => {
    const map = mapRef.current;
    markerRef.current?.setLngLat([longitudeValue, latitudeValue]);
    if (!map?.isStyleLoaded()) return;
    (map.getSource('geofence') as GeoJSONSource | undefined)?.setData(circleFeature(latitudeValue, longitudeValue, radiusM));
    fitRadius(map, latitudeValue, longitudeValue, radiusM);
  }, [latitudeValue, longitudeValue, radiusM, retryKey]);

  return (
    <div className="relative h-full min-h-80 w-full bg-canvas">
      <MapHost ref={containerRef} className="h-full min-h-80 w-full" />
      {mapStatus === 'loading' && (
        <div className="absolute inset-0 grid place-items-center bg-canvas/85">
          <p className="flex items-center gap-2 text-xs font-bold text-muted"><LoaderCircle className="size-4 animate-spin text-brand" />Đang tải bản đồ...</p>
        </div>
      )}
      {mapStatus === 'error' && (
        <div className="absolute inset-0 grid place-items-center bg-canvas px-6 text-center">
          <div><p className="text-sm font-extrabold">Không thể tải bản đồ</p><p className="mt-1 text-xs text-muted">Kiểm tra kết nối rồi tải lại bản đồ.</p><button type="button" className="mt-4 inline-flex h-9 items-center gap-2 border border-line bg-white px-3 text-xs font-bold" onClick={() => setRetryKey((value) => value + 1)}><RefreshCw className="size-4" />Tải lại</button></div>
        </div>
      )}
    </div>
  );
}

function createMarkerElement(color: string) {
  const element = document.createElement('div');
  element.className = 'workforce-map-marker';
  element.style.setProperty('--marker-color', color);
  element.innerHTML = '<span></span>';
  return element;
}

function fitRadius(map: MapLibreMap, latitude: number, longitude: number, radiusM: number) {
  const latDelta = Math.max(radiusM, 25) / 111_320;
  const lngDelta = latDelta / Math.max(Math.cos(latitude * Math.PI / 180), 0.2);
  map.fitBounds([[longitude - lngDelta, latitude - latDelta], [longitude + lngDelta, latitude + latDelta]], {
    padding: 48,
    maxZoom: 20,
    duration: 350,
  });
}

function circleFeature(latitude: number, longitude: number, radiusM: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const coordinates: [number, number][] = [];
  const angularDistance = radiusM / 6_371_008.8;
  const lat1 = latitude * Math.PI / 180;
  const lon1 = longitude * Math.PI / 180;
  for (let index = 0; index <= 72; index += 1) {
    const bearing = index / 72 * Math.PI * 2;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing));
    const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1), Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2));
    coordinates.push([lon2 * 180 / Math.PI, lat2 * 180 / Math.PI]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coordinates] } };
}
