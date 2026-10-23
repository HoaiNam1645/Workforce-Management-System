'use client';

import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getMapStyle } from '@/lib/map-provider';
import { MapHost } from './map-host';

type EmployeeLocationMapProps = {
  branchLatitude: number | null;
  branchLongitude: number | null;
  radiusM: number;
  employeeLatitude: number;
  employeeLongitude: number;
  accuracyM: number;
  withinGeofence: boolean | null;
};

maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

export default function EmployeeLocationMap(props: EmployeeLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const branchMarkerRef = useRef<Marker | null>(null);
  const employeeMarkerRef = useRef<Marker | null>(null);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryKey, setRetryKey] = useState(0);

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
      center: [props.employeeLongitude, props.employeeLatitude],
      zoom: 18,
      minZoom: 3,
      maxZoom: 21,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    const loadTimeout = window.setTimeout(() => setMapStatus('error'), 12_000);
    map.on('load', () => {
      window.clearTimeout(loadTimeout);
      setMapStatus('ready');
    });
    map.on('error', () => {
      if (!map.isStyleLoaded()) setMapStatus('error');
    });
    mapRef.current = map;
    return () => {
      window.clearTimeout(loadTimeout);
      branchMarkerRef.current?.remove();
      employeeMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // The map instance is retained while its data is updated by the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const render = () => {
      const employeeColor = props.withinGeofence === null ? '#2563eb' : props.withinGeofence ? '#0b8f70' : '#d55757';
      employeeMarkerRef.current?.remove();
      employeeMarkerRef.current = new maplibregl.Marker({ element: createMarkerElement(employeeColor) })
        .setLngLat([props.employeeLongitude, props.employeeLatitude])
        .setPopup(new maplibregl.Popup({ offset: 24 }).setText('Vị trí của bạn'))
        .addTo(map);
      branchMarkerRef.current?.remove();
      if (props.branchLatitude !== null && props.branchLongitude !== null) {
        branchMarkerRef.current = new maplibregl.Marker({ element: createMarkerElement('#2563eb') })
          .setLngLat([props.branchLongitude, props.branchLatitude])
          .setPopup(new maplibregl.Popup({ offset: 24 }).setText('Tâm khu vực chấm công'))
          .addTo(map);
      }
      setCircleSource(map, 'employee-accuracy', circleFeature(props.employeeLatitude, props.employeeLongitude, Math.max(props.accuracyM, 1)), employeeColor, 0.12);
      if (props.branchLatitude !== null && props.branchLongitude !== null) {
        setCircleSource(map, 'branch-geofence', circleFeature(props.branchLatitude, props.branchLongitude, props.radiusM), '#2563eb', 0.15);
      }
      fitLocations(map, props);
    };
    if (map.isStyleLoaded()) render();
    else map.once('load', render);
  }, [props, retryKey]);

  return (
    <div className="relative h-full min-h-64 w-full bg-canvas">
      <MapHost ref={containerRef} className="h-full min-h-64 w-full" />
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

function setCircleSource(map: MapLibreMap, id: string, data: GeoJSON.Feature<GeoJSON.Polygon>, color: string, opacity: number) {
  const source = map.getSource(id) as GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
    return;
  }
  map.addSource(id, { type: 'geojson', data });
  map.addLayer({ id: `${id}-fill`, type: 'fill', source: id, paint: { 'fill-color': color, 'fill-opacity': opacity } });
  map.addLayer({ id: `${id}-line`, type: 'line', source: id, paint: { 'line-color': color, 'line-width': 2 } });
}

function fitLocations(map: MapLibreMap, props: EmployeeLocationMapProps) {
  const bounds = new maplibregl.LngLatBounds([props.employeeLongitude, props.employeeLatitude], [props.employeeLongitude, props.employeeLatitude]);
  if (props.branchLatitude !== null && props.branchLongitude !== null) bounds.extend([props.branchLongitude, props.branchLatitude]);
  map.fitBounds(bounds, { padding: 64, maxZoom: 19, duration: 350 });
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
