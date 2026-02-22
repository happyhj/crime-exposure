import { describe, it, expect } from 'vitest';
import { parseSearchResult, type NominatimSearchResult } from '../../src/services/geocoding.js';

describe('geocoding', () => {
  describe('parseSearchResult', () => {
    it('parses a valid Nominatim search result', () => {
      const raw: NominatimSearchResult = {
        place_id: 123,
        display_name: '123 Pike St, Seattle, WA, USA',
        lat: '47.6062',
        lon: '-122.3321',
        type: 'house',
        importance: 0.8,
      };

      const result = parseSearchResult(raw);

      expect(result.displayName).toBe('123 Pike St, Seattle, WA, USA');
      expect(result.lat).toBeCloseTo(47.6062);
      expect(result.lon).toBeCloseTo(-122.3321);
    });

    it('parses coordinates from string to number', () => {
      const raw: NominatimSearchResult = {
        place_id: 456,
        display_name: 'Times Square, NYC',
        lat: '40.7580',
        lon: '-73.9855',
        type: 'attraction',
        importance: 0.9,
      };

      const result = parseSearchResult(raw);

      expect(typeof result.lat).toBe('number');
      expect(typeof result.lon).toBe('number');
      expect(result.lat).toBeCloseTo(40.758);
      expect(result.lon).toBeCloseTo(-73.9855);
    });

    it('handles extra properties without failing', () => {
      const raw: NominatimSearchResult = {
        place_id: 789,
        display_name: 'Downtown Dallas',
        lat: '32.7767',
        lon: '-96.7970',
        type: 'city',
        importance: 0.7,
        boundingbox: ['32.6', '33.0', '-97.0', '-96.5'],
        extra_field: true,
      };

      const result = parseSearchResult(raw);

      expect(result.displayName).toBe('Downtown Dallas');
      expect(result.lat).toBeCloseTo(32.7767);
    });
  });
});
