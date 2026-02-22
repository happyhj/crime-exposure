import { describe, it, expect } from 'vitest';
import {
  isCoordMissing,
  parseDallasDate,
  parseDallasTime,
  transformDallasRecord,
  type DallasRawRecord,
} from '../../src/adapters/dallas.js';

describe('DallasAdapter', () => {
  describe('isCoordMissing', () => {
    it('missing geocoded_column → true', () => {
      const record = { incidentnum: '1', date1: '2024-01-01' } as DallasRawRecord;
      expect(isCoordMissing(record)).toBe(true);
    });

    it('empty geocoded_column → true', () => {
      const record = { incidentnum: '1', date1: '2024-01-01', geocoded_column: {} } as DallasRawRecord;
      expect(isCoordMissing(record)).toBe(true);
    });

    it('valid coordinates → false', () => {
      const record = {
        incidentnum: '1',
        date1: '2024-01-01',
        geocoded_column: { latitude: '32.7767', longitude: '-96.7970' },
      } as DallasRawRecord;
      expect(isCoordMissing(record)).toBe(false);
    });

    it('(0,0) sentinel → true', () => {
      const record = {
        incidentnum: '1',
        date1: '2024-01-01',
        geocoded_column: { latitude: '0', longitude: '0' },
      } as DallasRawRecord;
      expect(isCoordMissing(record)).toBe(true);
    });
  });

  describe('parseDallasDate', () => {
    it('extracts YYYY-MM-DD from full timestamp', () => {
      expect(parseDallasDate('2024-06-15 14:30:00.0000000')).toBe('2024-06-15');
    });

    it('works with shorter format', () => {
      expect(parseDallasDate('2024-01-01')).toBe('2024-01-01');
    });
  });

  describe('parseDallasTime', () => {
    it('parses HH:MM format', () => {
      expect(parseDallasTime('22:15')).toBe(22);
    });

    it('parses midnight', () => {
      expect(parseDallasTime('00:00')).toBe(0);
    });

    it('returns null for missing time', () => {
      expect(parseDallasTime(undefined)).toBeNull();
    });

    it('returns null for empty time', () => {
      expect(parseDallasTime('')).toBeNull();
    });
  });

  describe('transformDallasRecord', () => {
    const baseRecord: DallasRawRecord = {
      incidentnum: '143577-2020',
      servnumid: '143577-2020-01',
      date1: '2024-06-15 22:15:00.0000000',
      time1: '22:15',
      nibrs_code: '13B',
      nibrs_crime: 'SIMPLE ASSAULT',
      geocoded_column: {
        latitude: '32.7767',
        longitude: '-96.7970',
      },
      beat: '434',
      division: 'SOUTHWEST',
      taag: 'CampWisdom Chaucer',
    };

    it('transforms a valid record', () => {
      const result = transformDallasRecord(baseRecord);
      expect(result).not.toBeNull();
      expect(result!.city).toBe('dallas');
      expect(result!.occurred_date).toBe('2024-06-15');
      expect(result!.occurred_hour).toBe(22);
      expect(result!.nibrs_code).toBe('13B');
      expect(result!.nibrs_category).toBe('Violent');
      expect(result!.latitude).toBe(32.7767);
      expect(result!.longitude).toBe(-96.797);
      expect(result!.district).toBe('434');
      expect(result!.neighborhood).toBe('CampWisdom Chaucer');
      expect(result!.precinct).toBe('SOUTHWEST');
      expect(result!.coord_precision).toBe('block');
    });

    it('handles missing geocoded_column → beat precision', () => {
      const record = { ...baseRecord, geocoded_column: undefined };
      const result = transformDallasRecord(record);
      expect(result!.latitude).toBeNull();
      expect(result!.longitude).toBeNull();
      expect(result!.coord_precision).toBe('beat');
    });

    it('returns null when nibrs_code is missing', () => {
      const record = { ...baseRecord, nibrs_code: undefined };
      expect(transformDallasRecord(record)).toBeNull();
    });

    it('classifies 999 as Other', () => {
      const record = { ...baseRecord, nibrs_code: '999' };
      const result = transformDallasRecord(record);
      expect(result!.nibrs_category).toBe('Other');
    });

    it('uses NIBRS native classification', () => {
      const record = { ...baseRecord, nibrs_code: '09A' };
      const result = transformDallasRecord(record);
      expect(result!.nibrs_category).toBe('Violent');
    });
  });
});
