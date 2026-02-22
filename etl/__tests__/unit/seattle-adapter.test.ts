import { describe, it, expect } from 'vitest';
import {
  isCoordMissing,
  parseSeattleDate,
  transformSeattleRecord,
  type SeattleRawRecord,
} from '../../src/adapters/seattle.js';
import fixtureData from '../fixtures/seattle-raw-sample.json';

const fixtures = fixtureData as SeattleRawRecord[];

describe('SeattleAdapter', () => {
  describe('isCoordMissing (sentinel detection)', () => {
    it('detects REDACTED as missing', () => {
      expect(isCoordMissing('REDACTED')).toBe(true);
    });

    it('detects -1.0 as missing', () => {
      expect(isCoordMissing('-1.0')).toBe(true);
    });

    it('detects dash as missing', () => {
      expect(isCoordMissing('-')).toBe(true);
    });

    it('detects undefined as missing', () => {
      expect(isCoordMissing(undefined)).toBe(true);
    });

    it('detects empty string as missing', () => {
      expect(isCoordMissing('')).toBe(true);
    });

    it('passes valid latitude', () => {
      expect(isCoordMissing('47.60620000')).toBe(false);
    });

    it('passes valid negative longitude', () => {
      expect(isCoordMissing('-122.33210000')).toBe(false);
    });
  });

  describe('parseSeattleDate', () => {
    it('parses ISO 8601 datetime', () => {
      const result = parseSeattleDate('2024-03-15T14:30:00.000');
      expect(result.date).toBe('2024-03-15');
      expect(result.hour).toBe(14);
    });

    it('parses midnight correctly', () => {
      const result = parseSeattleDate('2024-01-01T00:00:00.000');
      expect(result.date).toBe('2024-01-01');
      expect(result.hour).toBe(0);
    });

    it('parses late night correctly', () => {
      const result = parseSeattleDate('2024-09-10T23:45:00.000');
      expect(result.date).toBe('2024-09-10');
      expect(result.hour).toBe(23);
    });
  });

  describe('transformSeattleRecord', () => {
    it('transforms normal record with valid coords', () => {
      const result = transformSeattleRecord(fixtures[0]);
      expect(result).not.toBeNull();
      expect(result!.city).toBe('seattle');
      expect(result!.incident_id).toBe(1001);
      expect(result!.occurred_date).toBe('2024-03-15');
      expect(result!.occurred_hour).toBe(14);
      expect(result!.nibrs_code).toBe('23H');
      expect(result!.nibrs_category).toBe('Property');
      expect(result!.latitude).toBe(47.6062);
      expect(result!.longitude).toBe(-122.3321);
      expect(result!.district).toBe('F3');
      expect(result!.neighborhood).toBe('HIGHLAND PARK');
      expect(result!.precinct).toBe('Southwest');
      expect(result!.coord_precision).toBe('block');
    });

    it('handles REDACTED coords → beat precision', () => {
      const result = transformSeattleRecord(fixtures[1]);
      expect(result).not.toBeNull();
      expect(result!.latitude).toBeNull();
      expect(result!.longitude).toBeNull();
      expect(result!.coord_precision).toBe('beat');
      expect(result!.nibrs_code).toBe('13A');
      expect(result!.nibrs_category).toBe('Violent');
    });

    it('handles -1.0 sentinel → beat precision', () => {
      const result = transformSeattleRecord(fixtures[2]);
      expect(result).not.toBeNull();
      expect(result!.latitude).toBeNull();
      expect(result!.longitude).toBeNull();
      expect(result!.coord_precision).toBe('beat');
    });

    it('handles dash neighborhood as null', () => {
      const result = transformSeattleRecord(fixtures[2]);
      expect(result!.neighborhood).toBeNull();
    });

    it('classifies Society crime correctly', () => {
      const result = transformSeattleRecord(fixtures[3]);
      expect(result!.nibrs_code).toBe('35A');
      expect(result!.nibrs_category).toBe('Society');
    });

    it('handles missing lat/lon fields → beat precision', () => {
      const result = transformSeattleRecord(fixtures[4]);
      expect(result).not.toBeNull();
      expect(result!.latitude).toBeNull();
      expect(result!.longitude).toBeNull();
      expect(result!.coord_precision).toBe('beat');
      expect(result!.nibrs_code).toBe('09A');
      expect(result!.nibrs_category).toBe('Violent');
    });

    it('returns null for record without nibrs_offense_code', () => {
      const raw: SeattleRawRecord = {
        offense_id: '9999',
        offense_date: '2024-01-01T00:00:00.000',
        latitude: '47.0',
        longitude: '-122.0',
      };
      expect(transformSeattleRecord(raw)).toBeNull();
    });
  });
});
