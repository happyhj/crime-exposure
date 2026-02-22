import type { CrimeRecord } from './api.js';
import type { BeatIndex } from './beat-fallback.js';
import { randomPointInBeat } from './beat-fallback.js';

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
  coord_precision: string;
}

export type CrimeFeature = GeoJSON.Feature<GeoJSON.Point, CrimeFeatureProperties>;

/**
 * Convert crime records to GeoJSON features.
 * Records with coord_precision='beat' and null coordinates are placed
 * at random points within their beat polygon (if beatIndex is provided).
 */
export function crimesToGeoJSON(
  records: CrimeRecord[],
  beatIndex?: BeatIndex,
): GeoJSON.FeatureCollection<GeoJSON.Point, CrimeFeatureProperties> {
  const features: CrimeFeature[] = [];

  for (const r of records) {
    let lng = r.longitude;
    let lat = r.latitude;
    let precision = r.coord_precision ?? 'block';

    // Beat fallback: generate random point within beat polygon
    if ((lat === null || lng === null) && r.district && beatIndex) {
      const beatPolygon = beatIndex.get(r.district);
      if (beatPolygon) {
        const coords = randomPointInBeat(beatPolygon);
        if (coords) {
          [lng, lat] = coords;
          precision = 'beat';
        }
      }
    }

    // Skip records with no coordinates even after fallback
    if (lat === null || lng === null) continue;

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      properties: {
        incident_id: r.incident_id,
        nibrs_code: r.nibrs_code,
        nibrs_category: r.nibrs_category,
        occurred_date: r.occurred_date,
        occurred_hour: r.occurred_hour,
        neighborhood: r.neighborhood,
        coord_precision: precision,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}
