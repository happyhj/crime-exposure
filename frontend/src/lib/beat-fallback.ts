import bbox from '@turf/bbox';
import { randomPoint } from '@turf/random';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { Feature, MultiPolygon, Polygon, FeatureCollection } from 'geojson';

type BeatPolygon = Feature<Polygon | MultiPolygon, { beat: string }>;
type BeatIndex = Map<string, BeatPolygon>;

/**
 * Build an index from beat code → polygon feature for fast lookup.
 */
export function buildBeatIndex(
  geojson: FeatureCollection,
): BeatIndex {
  const index: BeatIndex = new Map();
  for (const feature of geojson.features) {
    const beat = feature.properties?.beat;
    if (beat && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
      index.set(String(beat), feature as BeatPolygon);
    }
  }
  return index;
}

/**
 * Generate a random point within a beat polygon.
 * Uses rejection sampling: generate random points in bounding box,
 * keep the first one that falls within the polygon.
 */
export function randomPointInBeat(
  beatPolygon: BeatPolygon,
  maxAttempts = 20,
): [number, number] | null {
  const bounds = bbox(beatPolygon);

  for (let i = 0; i < maxAttempts; i++) {
    const pts = randomPoint(1, { bbox: bounds });
    const pt = pts.features[0];
    if (booleanPointInPolygon(pt, beatPolygon)) {
      return pt.geometry.coordinates as [number, number];
    }
  }

  // Fallback: return centroid-ish point (center of bbox)
  return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
}

export type { BeatIndex };
