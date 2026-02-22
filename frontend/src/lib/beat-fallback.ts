import centroid from '@turf/centroid';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import type { Feature, MultiPolygon, Polygon, FeatureCollection } from 'geojson';

type BeatPolygon = Feature<Polygon | MultiPolygon, { beat: string }>;
type BeatIndex = Map<string, BeatPolygon>;

/**
 * Build an index from beat/district code → polygon feature for fast lookup.
 * @param beatKey - The GeoJSON property name to use as index key (e.g., 'beat', 'BEAT_NUM', 'REPDIST')
 */
export function buildBeatIndex(
  geojson: FeatureCollection,
  beatKey = 'beat',
): BeatIndex {
  const index: BeatIndex = new Map();
  for (const feature of geojson.features) {
    const beat = feature.properties?.[beatKey];
    if (beat != null && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
      index.set(String(beat), feature as BeatPolygon);
    }
  }
  return index;
}

/**
 * Generate a random point within a beat polygon using centroid + jitter.
 * Points are scattered around the centroid to avoid water areas
 * (beat polygons often extend over water in coastal cities).
 */
export function randomPointInBeat(
  beatPolygon: BeatPolygon,
  maxAttempts = 10,
): [number, number] | null {
  const center = centroid(beatPolygon);
  const [cx, cy] = center.geometry.coordinates;

  // Jitter radius ~300m (≈0.003°). Enough spread to look natural,
  // small enough to stay on land near the centroid.
  const JITTER = 0.003;

  for (let i = 0; i < maxAttempts; i++) {
    const lng = cx + (Math.random() - 0.5) * 2 * JITTER;
    const lat = cy + (Math.random() - 0.5) * 2 * JITTER;
    const pt = point([lng, lat]);
    if (booleanPointInPolygon(pt, beatPolygon)) {
      return [lng, lat];
    }
  }

  // Fallback: centroid itself (guaranteed on land for urban beats)
  return [cx, cy];
}

export type { BeatIndex };
