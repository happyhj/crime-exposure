const OSRM_BASE = 'https://router.project-osrm.org/route/v1/foot';
const RATE_LIMIT_MS = 1100;

export interface RouteResult {
  /** GeoJSON LineString coordinates [[lon,lat], ...] */
  coordinates: [number, number][];
  /** Total distance in meters */
  distance: number;
  /** Total duration in seconds */
  duration: number;
}

let lastOsrmRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const wait = Math.max(0, RATE_LIMIT_MS - (now - lastOsrmRequestTime));
  if (wait > 0) {
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  lastOsrmRequestTime = Date.now();
  return fetch(url);
}

/**
 * Get a walking route between two points using OSRM.
 */
export async function getFootRoute(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): Promise<RouteResult | null> {
  const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = `${OSRM_BASE}/${coords}?geometries=geojson&overview=full&steps=true`;

  const res = await rateLimitedFetch(url);
  if (!res.ok) return null;

  const data: OsrmResponse = await res.json();
  return parseOsrmResponse(data);
}

/**
 * Parse an OSRM API response into a RouteResult.
 * Returns null if the response indicates no route found.
 */
export function parseOsrmResponse(data: OsrmResponse): RouteResult | null {
  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    return null;
  }

  const route = data.routes[0];
  return {
    coordinates: route.geometry.coordinates as [number, number][],
    distance: route.distance,
    duration: route.duration,
  };
}

/**
 * Format duration (seconds) as human-readable string.
 */
export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

/**
 * Format distance (meters) as human-readable string.
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// ---------- OSRM response types ----------

export interface OsrmResponse {
  code: string;
  routes: OsrmRoute[];
  waypoints?: unknown[];
}

export interface OsrmRoute {
  geometry: {
    type: 'LineString';
    coordinates: number[][];
  };
  distance: number;
  duration: number;
  legs: unknown[];
}
