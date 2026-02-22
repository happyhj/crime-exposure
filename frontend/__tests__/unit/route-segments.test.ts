import { describe, it, expect } from 'vitest';
import {
  haversineDistance,
  splitRoute,
  countCrimesNearSegment,
  crimeCountToColor,
  computeRouteSegments,
} from '../../src/utils/route-segments.js';

describe('haversineDistance', () => {
  it('returns 0 for same point', () => {
    expect(haversineDistance(47.6, -122.3, 47.6, -122.3)).toBe(0);
  });

  it('returns approximate distance between known points', () => {
    // Seattle to ~1km away
    const dist = haversineDistance(47.6062, -122.3321, 47.6152, -122.3321);
    expect(dist).toBeGreaterThan(900);
    expect(dist).toBeLessThan(1100);
  });
});

describe('splitRoute', () => {
  it('returns single segment for short route', () => {
    const coords: [number, number][] = [[-122.33, 47.60], [-122.3301, 47.6001]];
    const segments = splitRoute(coords, 10000); // 10km segments
    expect(segments).toHaveLength(1);
  });

  it('splits longer route into multiple segments', () => {
    // Create a route spanning ~1km
    const coords: [number, number][] = [
      [-122.33, 47.60],
      [-122.33, 47.605],
      [-122.33, 47.61],
    ];
    const segments = splitRoute(coords, 100);
    expect(segments.length).toBeGreaterThan(1);
  });

  it('handles single point', () => {
    const coords: [number, number][] = [[-122.33, 47.60]];
    const segments = splitRoute(coords);
    expect(segments).toHaveLength(1);
  });
});

describe('countCrimesNearSegment', () => {
  it('counts crimes within buffer', () => {
    const segment: [number, number][] = [[-122.33, 47.60], [-122.33, 47.601]];
    const crimes = [
      { latitude: 47.6005, longitude: -122.33 },   // very close
      { latitude: 47.6005, longitude: -122.3301 },  // close
      { latitude: 47.70, longitude: -122.33 },      // far away
    ];
    const count = countCrimesNearSegment(segment, crimes, 200);
    expect(count).toBe(2);
  });

  it('returns 0 for empty crimes', () => {
    const segment: [number, number][] = [[-122.33, 47.60], [-122.33, 47.601]];
    expect(countCrimesNearSegment(segment, [], 200)).toBe(0);
  });
});

describe('crimeCountToColor', () => {
  it('returns green for low crime', () => {
    expect(crimeCountToColor(0)).toBe('#66bb6a');
    expect(crimeCountToColor(2)).toBe('#66bb6a');
  });

  it('returns yellow for moderate crime', () => {
    expect(crimeCountToColor(3)).toBe('#fdd835');
    expect(crimeCountToColor(5)).toBe('#fdd835');
  });

  it('returns orange for high crime', () => {
    expect(crimeCountToColor(6)).toBe('#ffa726');
    expect(crimeCountToColor(10)).toBe('#ffa726');
  });

  it('returns red for very high crime', () => {
    expect(crimeCountToColor(11)).toBe('#ef5350');
    expect(crimeCountToColor(100)).toBe('#ef5350');
  });
});

describe('computeRouteSegments', () => {
  it('returns segments with crime counts and colors', () => {
    const coords: [number, number][] = [
      [-122.33, 47.60],
      [-122.33, 47.601],
      [-122.33, 47.602],
    ];
    const crimes = [
      { latitude: 47.6005, longitude: -122.33 },
    ];
    const segments = computeRouteSegments(coords, crimes, 500, 200);
    expect(segments.length).toBeGreaterThan(0);
    expect(segments[0]).toHaveProperty('crimeCount');
    expect(segments[0]).toHaveProperty('color');
    expect(segments[0]).toHaveProperty('coordinates');
  });
});
