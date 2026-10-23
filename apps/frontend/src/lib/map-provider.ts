import type { StyleSpecification } from 'maplibre-gl';

export const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim() ?? '';

export function getMapStyle(): StyleSpecification | null {
  if (!MAPTILER_KEY) return null;
  return {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        url: `https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=${MAPTILER_KEY}`,
        tileSize: 256,
      },
    },
    layers: [
      {
        id: 'satellite',
        type: 'raster',
        source: 'satellite',
        paint: { 'raster-fade-duration': 0 },
      },
    ],
  };
}
