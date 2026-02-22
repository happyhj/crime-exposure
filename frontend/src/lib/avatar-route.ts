import along from '@turf/along';
import length from '@turf/length';
import { lineString } from '@turf/helpers';
import type { Feature, LineString } from 'geojson';

interface RouteCache {
  line: Feature<LineString>;
  length: number;
}

const cache = new Map<string, RouteCache>();

function getOrCreateRoute(coords: [number, number][]): RouteCache {
  const key = JSON.stringify(coords);
  let entry = cache.get(key);
  if (!entry) {
    const line = lineString(coords);
    entry = { line, length: length(line, { units: 'kilometers' }) };
    cache.set(key, entry);
  }
  return entry;
}

/**
 * Get the position along a route for a given hour (0-23).
 * Hour 0 = start of route, hour 23 = end of route.
 */
export function getAvatarPosition(hour: number, routeCoords: [number, number][]): [number, number] {
  const route = getOrCreateRoute(routeCoords);
  const fraction = Math.max(0, Math.min(23, hour)) / 23;
  const distance = fraction * route.length;
  const point = along(route.line, distance, { units: 'kilometers' });
  return point.geometry.coordinates as [number, number];
}

export function getRouteGeoJSON(routeCoords: [number, number][]): Feature<LineString> {
  return getOrCreateRoute(routeCoords).line;
}
