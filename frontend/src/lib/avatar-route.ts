import along from '@turf/along';
import length from '@turf/length';
import { lineString } from '@turf/helpers';
import type { Feature, LineString } from 'geojson';

/**
 * Preset route: Seattle Downtown → Pike Place Market → Pioneer Square
 * Coordinates follow a walking path through downtown Seattle.
 */
const SEATTLE_ROUTE_COORDS: [number, number][] = [
  [-122.3374, 47.6101],  // Westlake Center
  [-122.3389, 47.6094],  // heading west on Pine St
  [-122.3420, 47.6088],  // Pike Place Market entrance
  [-122.3426, 47.6085],  // Pike Place Market interior
  [-122.3415, 47.6072],  // heading south on 1st Ave
  [-122.3400, 47.6055],  // Columbia St
  [-122.3385, 47.6040],  // Yesler Way
  [-122.3340, 47.6020],  // Pioneer Square (Occidental Park)
  [-122.3320, 47.6005],  // King Street Station area
];

const routeLine: Feature<LineString> = lineString(SEATTLE_ROUTE_COORDS);
const routeLength = length(routeLine, { units: 'kilometers' });

/**
 * Get the position along the preset route for a given hour (0-23).
 * Hour 0 = start of route, hour 23 = end of route.
 */
export function getAvatarPosition(hour: number): [number, number] {
  const fraction = Math.max(0, Math.min(23, hour)) / 23;
  const distance = fraction * routeLength;
  const point = along(routeLine, distance, { units: 'kilometers' });
  return point.geometry.coordinates as [number, number];
}

export function getRouteGeoJSON(): Feature<LineString> {
  return routeLine;
}
