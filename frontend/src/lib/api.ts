export interface CrimeRecord {
  incident_id: number;
  city: string;
  occurred_date: string;
  occurred_hour: number | null;
  nibrs_code: string;
  nibrs_category: string;
  latitude: number | null;
  longitude: number | null;
  district: string | null;
  neighborhood: string | null;
  precinct: string | null;
  coord_precision: string;
}

export interface CrimesResponse {
  data: CrimeRecord[];
  meta: { total: number; limit: number; offset: number };
}

export async function fetchCrimes(params: {
  city: string;
  from: string;
  to: string;
  limit?: number;
}): Promise<CrimesResponse> {
  const searchParams = new URLSearchParams({
    city: params.city,
    from: params.from,
    to: params.to,
  });
  if (params.limit) searchParams.set('limit', String(params.limit));

  const res = await fetch(`/api/crimes?${searchParams}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface StatsEntry {
  key: string;
  count: number;
  category?: string;
}

export interface StatsResponse {
  data: StatsEntry[];
}

export interface CorridorResponse {
  data: CrimeRecord[];
  meta: {
    total: number;
    buffer_meters: number;
    hour_range: [number, number] | null;
    by_category: Record<string, number>;
  };
}

export async function fetchCorridorCrimes(params: {
  route: { type: 'LineString'; coordinates: number[][] };
  buffer_meters?: number;
  city: string;
  hour_start?: number;
  hour_end?: number;
  from?: string;
  to?: string;
}): Promise<CorridorResponse> {
  const res = await fetch('/api/crimes/corridor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface RadiusResponse {
  data: CrimeRecord[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    radius_meters: number;
    by_category: Record<string, number>;
    hour_range: [number, number] | null;
  };
}

export async function fetchRadiusCrimes(params: {
  lat: number;
  lon: number;
  radius: string;
  city?: string;
  nibrs_category?: string;
  hour_start?: number;
  hour_end?: number;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<RadiusResponse> {
  const searchParams = new URLSearchParams({
    lat: String(params.lat),
    lon: String(params.lon),
    radius: params.radius,
  });
  if (params.city) searchParams.set('city', params.city);
  if (params.nibrs_category) searchParams.set('nibrs_category', params.nibrs_category);
  if (params.hour_start != null) searchParams.set('hour_start', String(params.hour_start));
  if (params.hour_end != null) searchParams.set('hour_end', String(params.hour_end));
  if (params.from) searchParams.set('from', params.from);
  if (params.to) searchParams.set('to', params.to);
  if (params.limit) searchParams.set('limit', String(params.limit));

  const res = await fetch(`/api/crimes?${searchParams}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchCrimeStats(params: {
  city: string;
  groupBy: 'hour' | 'nibrs_category' | 'nibrs_code';
  from?: string;
  to?: string;
}): Promise<StatsResponse> {
  const searchParams = new URLSearchParams({
    city: params.city,
    groupBy: params.groupBy,
  });
  if (params.from) searchParams.set('from', params.from);
  if (params.to) searchParams.set('to', params.to);

  const res = await fetch(`/api/crimes/stats?${searchParams}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
