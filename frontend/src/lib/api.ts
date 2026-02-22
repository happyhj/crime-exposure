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
