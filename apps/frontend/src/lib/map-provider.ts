export const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim() ?? '';

export function getMapStyleUrl() {
  return MAPTILER_KEY
    ? `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`
    : null;
}
