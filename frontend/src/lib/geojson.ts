import type { CrimeRecord } from './api.js';

export const CATEGORY_COLORS: Record<string, string> = {
  Violent: '#e53935',   // red
  Property: '#fb8c00',  // orange
  Society: '#1e88e5',   // blue
  Other: '#757575',     // grey
};

export interface CrimeFeatureProperties {
  incident_id: number;
  nibrs_code: string;
  nibrs_category: string;
  occurred_date: string;
  occurred_hour: number | null;
  neighborhood: string | null;
}

export type CrimeFeature = GeoJSON.Feature<GeoJSON.Point, CrimeFeatureProperties>;

export function crimesToGeoJSON(records: CrimeRecord[]): GeoJSON.FeatureCollection<GeoJSON.Point, CrimeFeatureProperties> {
  const features: CrimeFeature[] = [];

  for (const r of records) {
    if (r.latitude === null || r.longitude === null) continue;

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [r.longitude, r.latitude],
      },
      properties: {
        incident_id: r.incident_id,
        nibrs_code: r.nibrs_code,
        nibrs_category: r.nibrs_category,
        occurred_date: r.occurred_date,
        occurred_hour: r.occurred_hour,
        neighborhood: r.neighborhood,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}
