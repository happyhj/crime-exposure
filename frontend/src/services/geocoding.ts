const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'CrimeExposure/1.0 (https://github.com/happyhj/crime-exposure)';
const RATE_LIMIT_MS = 1100; // slightly > 1 sec to respect Nominatim policy

export interface GeocodingResult {
  displayName: string;
  lat: number;
  lon: number;
}

let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const wait = Math.max(0, RATE_LIMIT_MS - (now - lastRequestTime));
  if (wait > 0) {
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  lastRequestTime = Date.now();
  return fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });
}

/**
 * Forward geocoding: address text → list of candidate locations.
 * Returns up to `limit` results (default 5).
 */
export async function forwardGeocode(
  query: string,
  limit = 5,
): Promise<GeocodingResult[]> {
  if (!query.trim()) return [];

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: String(limit),
    countrycodes: 'us',
    addressdetails: '1',
  });

  const res = await rateLimitedFetch(`${NOMINATIM_BASE}/search?${params}`);
  if (!res.ok) return [];

  const data: NominatimSearchResult[] = await res.json();
  return data.map(parseSearchResult);
}

/**
 * Reverse geocoding: lat/lon → address string.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<GeocodingResult | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'json',
    addressdetails: '1',
  });

  const res = await rateLimitedFetch(`${NOMINATIM_BASE}/reverse?${params}`);
  if (!res.ok) return null;

  const data: NominatimReverseResult = await res.json();
  if (data.error) return null;

  return {
    displayName: data.display_name,
    lat: parseFloat(data.lat),
    lon: parseFloat(data.lon),
  };
}

/** Parse a Nominatim search result into our GeocodingResult. */
export function parseSearchResult(raw: NominatimSearchResult): GeocodingResult {
  return {
    displayName: raw.display_name,
    lat: parseFloat(raw.lat),
    lon: parseFloat(raw.lon),
  };
}

// ---------- Nominatim response types ----------

export interface NominatimSearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  importance: number;
  [key: string]: unknown;
}

export interface NominatimReverseResult {
  display_name: string;
  lat: string;
  lon: string;
  error?: string;
  [key: string]: unknown;
}
