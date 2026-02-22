/**
 * Route segmentation for crime density visualization.
 *
 * Splits a route LineString into fixed-length segments and counts
 * nearby crimes for each segment to determine danger level.
 */

export interface RouteSegment {
  /** Segment coordinates [[lon, lat], ...] */
  coordinates: [number, number][];
  /** Number of crimes within buffer of this segment */
  crimeCount: number;
  /** Danger color based on crime count */
  color: string;
}

export interface CrimePoint {
  latitude: number;
  longitude: number;
}

/**
 * Approximate distance in meters between two lat/lon points using Haversine.
 */
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Interpolate a point along the line between p1 and p2 at fraction t (0–1).
 */
function interpolatePoint(
  p1: [number, number], p2: [number, number], t: number,
): [number, number] {
  return [
    p1[0] + (p2[0] - p1[0]) * t,
    p1[1] + (p2[1] - p1[1]) * t,
  ];
}

/**
 * Split a route into segments of approximately `segmentLength` meters.
 */
export function splitRoute(
  coordinates: [number, number][],
  segmentLengthM: number = 100,
): [number, number][][] {
  if (coordinates.length < 2) return [coordinates];

  const segments: [number, number][][] = [];
  let currentSegment: [number, number][] = [coordinates[0]];
  let accumulated = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const prev = coordinates[i - 1];
    const curr = coordinates[i];
    const dist = haversineDistance(prev[1], prev[0], curr[1], curr[0]);

    if (accumulated + dist >= segmentLengthM) {
      // Need to split this edge
      let remaining = dist;
      let from = prev;

      while (accumulated + remaining >= segmentLengthM) {
        const needed = segmentLengthM - accumulated;
        const t = needed / remaining;
        const splitPoint = interpolatePoint(from, curr, t);
        currentSegment.push(splitPoint);
        segments.push(currentSegment);

        currentSegment = [splitPoint];
        remaining -= needed;
        accumulated = 0;
        from = splitPoint;
      }

      currentSegment.push(curr);
      accumulated = remaining;
    } else {
      currentSegment.push(curr);
      accumulated += dist;
    }
  }

  if (currentSegment.length > 1) {
    segments.push(currentSegment);
  }

  return segments;
}

/**
 * Count crimes within `bufferM` meters of any point in a segment.
 * Uses the segment's midpoint for efficiency.
 */
export function countCrimesNearSegment(
  segment: [number, number][],
  crimes: CrimePoint[],
  bufferM: number = 200,
): number {
  if (segment.length === 0) return 0;

  // Use midpoint of segment for distance check
  const midIdx = Math.floor(segment.length / 2);
  const midLon = segment[midIdx][0];
  const midLat = segment[midIdx][1];

  let count = 0;
  for (const crime of crimes) {
    const dist = haversineDistance(midLat, midLon, crime.latitude, crime.longitude);
    if (dist <= bufferM) count++;
  }
  return count;
}

/**
 * Map crime count to a color.
 */
export function crimeCountToColor(count: number): string {
  if (count <= 2) return '#66bb6a';  // green
  if (count <= 5) return '#fdd835';  // yellow
  if (count <= 10) return '#ffa726'; // orange
  return '#ef5350';                   // red
}

/**
 * Full pipeline: split route → count crimes → assign colors.
 */
export function computeRouteSegments(
  routeCoords: [number, number][],
  crimes: CrimePoint[],
  segmentLengthM: number = 100,
  bufferM: number = 200,
): RouteSegment[] {
  const splits = splitRoute(routeCoords, segmentLengthM);

  return splits.map(coords => {
    const crimeCount = countCrimesNearSegment(coords, crimes, bufferM);
    return {
      coordinates: coords,
      crimeCount,
      color: crimeCountToColor(crimeCount),
    };
  });
}

/**
 * Convert route segments to a GeoJSON FeatureCollection for MapLibre rendering.
 * Each segment is a LineString feature with color and crimeCount properties.
 */
export function segmentsToGeoJSON(segments: RouteSegment[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: segments.map((seg, i) => ({
      type: 'Feature' as const,
      properties: {
        index: i,
        crimeCount: seg.crimeCount,
        color: seg.color,
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: seg.coordinates,
      },
    })),
  };
}
