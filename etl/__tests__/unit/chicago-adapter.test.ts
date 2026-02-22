import { describe, it, expect } from 'vitest';
import {
  isCoordMissing,
  parseChicagoDate,
  mapFbiToNibrs,
  lookupCommunityArea,
  transformChicagoRecord,
  type ChicagoRawRecord,
} from '../../src/adapters/chicago.js';
import fixtureData from '../fixtures/chicago-raw-sample.json';

const fixtures = fixtureData as ChicagoRawRecord[];

describe('ChicagoAdapter', () => {
  describe('isCoordMissing (sentinel detection)', () => {
    it('detects null as missing', () => {
      expect(isCoordMissing(null as unknown as undefined)).toBe(true);
    });

    it('detects undefined as missing', () => {
      expect(isCoordMissing(undefined)).toBe(true);
    });

    it('detects empty string as missing', () => {
      expect(isCoordMissing('')).toBe(true);
    });

    it('passes valid latitude', () => {
      expect(isCoordMissing('41.832337226')).toBe(false);
    });
  });

  describe('mapFbiToNibrs', () => {
    it('01A → 09A (Murder)', () => {
      const result = mapFbiToNibrs('01A');
      expect(result.code).toBe('09A');
      expect(result.category).toBe('Violent');
    });

    it('06 → 23H (Larceny/Theft)', () => {
      const result = mapFbiToNibrs('06');
      expect(result.code).toBe('23H');
      expect(result.category).toBe('Property');
    });

    it('18 → 35A (Drug/Narcotic)', () => {
      const result = mapFbiToNibrs('18');
      expect(result.code).toBe('35A');
      expect(result.category).toBe('Society');
    });

    it('unknown code → Other', () => {
      const result = mapFbiToNibrs('99');
      expect(result.code).toBe('99');
      expect(result.category).toBe('Other');
    });
  });

  describe('lookupCommunityArea', () => {
    it('35 → Douglas', () => {
      expect(lookupCommunityArea('35')).toBe('Douglas');
    });

    it('32 → Loop', () => {
      expect(lookupCommunityArea('32')).toBe('Loop');
    });

    it('undefined → null', () => {
      expect(lookupCommunityArea(undefined)).toBeNull();
    });

    it('unknown number → null', () => {
      expect(lookupCommunityArea('999')).toBeNull();
    });
  });

  describe('parseChicagoDate', () => {
    it('parses ISO 8601 datetime', () => {
      const result = parseChicagoDate('2024-03-15T14:30:00.000');
      expect(result.date).toBe('2024-03-15');
      expect(result.hour).toBe(14);
    });

    it('parses midnight correctly', () => {
      const result = parseChicagoDate('2024-01-01T00:00:00.000');
      expect(result.date).toBe('2024-01-01');
      expect(result.hour).toBe(0);
    });

    it('parses late night correctly', () => {
      const result = parseChicagoDate('2024-09-10T23:45:00.000');
      expect(result.date).toBe('2024-09-10');
      expect(result.hour).toBe(23);
    });
  });

  describe('transformChicagoRecord', () => {
    it('transforms normal record with valid coords', () => {
      const result = transformChicagoRecord(fixtures[0]);
      expect(result).not.toBeNull();
      expect(result!.city).toBe('chicago');
      expect(result!.incident_id).toBe(14109448);
      expect(result!.occurred_date).toBe('2024-03-15');
      expect(result!.occurred_hour).toBe(14);
      expect(result!.nibrs_code).toBe('23H');
      expect(result!.nibrs_category).toBe('Property');
      expect(result!.latitude).toBeCloseTo(41.832);
      expect(result!.longitude).toBeCloseTo(-87.622);
      expect(result!.district).toBe('0211'); // beat
      expect(result!.neighborhood).toBe('Douglas'); // community_area 35
      expect(result!.precinct).toBe('002'); // district
      expect(result!.coord_precision).toBe('block');
    });

    it('maps homicide correctly (01A → 09A Violent)', () => {
      const result = transformChicagoRecord(fixtures[1]);
      expect(result!.nibrs_code).toBe('09A');
      expect(result!.nibrs_category).toBe('Violent');
    });

    it('handles missing coords → beat precision', () => {
      const result = transformChicagoRecord(fixtures[2]);
      expect(result).not.toBeNull();
      expect(result!.latitude).toBeNull();
      expect(result!.longitude).toBeNull();
      expect(result!.coord_precision).toBe('beat');
      expect(result!.neighborhood).toBe('Loop'); // community_area 32
    });

    it('maps society crime (18 → 35A)', () => {
      const result = transformChicagoRecord(fixtures[3]);
      expect(result!.nibrs_code).toBe('35A');
      expect(result!.nibrs_category).toBe('Society');
      expect(result!.neighborhood).toBe('Lincoln Park'); // community_area 7
    });

    it('handles unknown fbi_code → Other', () => {
      const result = transformChicagoRecord(fixtures[4]);
      expect(result!.nibrs_code).toBe('99');
      expect(result!.nibrs_category).toBe('Other');
    });

    it('returns null for record without fbi_code', () => {
      const raw: ChicagoRawRecord = {
        id: '9999',
        date: '2024-01-01T00:00:00.000',
        latitude: '41.0',
        longitude: '-87.0',
      };
      expect(transformChicagoRecord(raw)).toBeNull();
    });
  });
});
