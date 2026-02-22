import { describe, it, expect } from 'vitest';
import { parseOsrmResponse, formatDuration, formatDistance, type OsrmResponse } from '../../src/services/routing.js';

describe('routing', () => {
  describe('parseOsrmResponse', () => {
    it('parses a valid OSRM response', () => {
      const response: OsrmResponse = {
        code: 'Ok',
        routes: [{
          geometry: {
            type: 'LineString',
            coordinates: [[-122.33, 47.60], [-122.34, 47.61], [-122.35, 47.62]],
          },
          distance: 1500,
          duration: 1200,
          legs: [],
        }],
      };

      const result = parseOsrmResponse(response);

      expect(result).not.toBeNull();
      expect(result!.coordinates).toHaveLength(3);
      expect(result!.coordinates[0]).toEqual([-122.33, 47.60]);
      expect(result!.distance).toBe(1500);
      expect(result!.duration).toBe(1200);
    });

    it('returns null for non-Ok response', () => {
      const response: OsrmResponse = {
        code: 'NoRoute',
        routes: [],
      };

      expect(parseOsrmResponse(response)).toBeNull();
    });

    it('returns null for empty routes array', () => {
      const response: OsrmResponse = {
        code: 'Ok',
        routes: [],
      };

      expect(parseOsrmResponse(response)).toBeNull();
    });

    it('uses first route when multiple available', () => {
      const response: OsrmResponse = {
        code: 'Ok',
        routes: [
          {
            geometry: { type: 'LineString', coordinates: [[-122.33, 47.60]] },
            distance: 1000,
            duration: 800,
            legs: [],
          },
          {
            geometry: { type: 'LineString', coordinates: [[-122.34, 47.61]] },
            distance: 2000,
            duration: 1600,
            legs: [],
          },
        ],
      };

      const result = parseOsrmResponse(response);
      expect(result!.distance).toBe(1000);
    });
  });

  describe('formatDuration', () => {
    it('formats seconds as minutes', () => {
      expect(formatDuration(300)).toBe('5 min');
      expect(formatDuration(60)).toBe('1 min');
      expect(formatDuration(90)).toBe('2 min');
    });

    it('formats over 60 min as hours + minutes', () => {
      expect(formatDuration(3600)).toBe('1h');
      expect(formatDuration(5400)).toBe('1h 30m');
      expect(formatDuration(7200)).toBe('2h');
    });
  });

  describe('formatDistance', () => {
    it('formats meters under 1km', () => {
      expect(formatDistance(500)).toBe('500 m');
      expect(formatDistance(999)).toBe('999 m');
    });

    it('formats meters over 1km as km', () => {
      expect(formatDistance(1000)).toBe('1.0 km');
      expect(formatDistance(2500)).toBe('2.5 km');
      expect(formatDistance(10000)).toBe('10.0 km');
    });
  });
});
