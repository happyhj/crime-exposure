import { describe, it, expect } from 'vitest';
import {
  isCoordMissing,
  parseNYCDate,
  parseNYCTime,
  mapKyToNibrs,
  transformNYCRecord,
  type NYCRawRecord,
} from '../../src/adapters/nyc.js';

describe('NYCAdapter', () => {
  describe('isCoordMissing', () => {
    it('detects missing lat', () => {
      expect(isCoordMissing(undefined, '-73.9857')).toBe(true);
    });

    it('detects missing lon', () => {
      expect(isCoordMissing('40.7484', undefined)).toBe(true);
    });

    it('detects empty strings', () => {
      expect(isCoordMissing('', '')).toBe(true);
    });

    it('passes valid coordinates', () => {
      expect(isCoordMissing('40.7484', '-73.9857')).toBe(false);
    });
  });

  describe('parseNYCDate', () => {
    it('extracts YYYY-MM-DD from ISO 8601', () => {
      expect(parseNYCDate('2024-12-09T00:00:00.000')).toBe('2024-12-09');
    });
  });

  describe('parseNYCTime', () => {
    it('parses HH:MM:SS format', () => {
      expect(parseNYCTime('04:37:00')).toBe(4);
    });

    it('parses midnight', () => {
      expect(parseNYCTime('00:00:00')).toBe(0);
    });

    it('parses 23:59:59', () => {
      expect(parseNYCTime('23:59:59')).toBe(23);
    });

    it('returns null for missing time', () => {
      expect(parseNYCTime(undefined)).toBeNull();
    });
  });

  describe('mapKyToNibrs', () => {
    it('maps murder (101) → 09A Violent', () => {
      expect(mapKyToNibrs('101')).toEqual({ code: '09A', category: 'Violent' });
    });

    it('maps robbery (105) → 120 Violent', () => {
      expect(mapKyToNibrs('105')).toEqual({ code: '120', category: 'Violent' });
    });

    it('maps burglary (107) → 220 Property', () => {
      expect(mapKyToNibrs('107')).toEqual({ code: '220', category: 'Property' });
    });

    it('maps grand larceny MV (110) → 240 Property', () => {
      expect(mapKyToNibrs('110')).toEqual({ code: '240', category: 'Property' });
    });

    it('maps drugs (117) → 35A Society', () => {
      expect(mapKyToNibrs('117')).toEqual({ code: '35A', category: 'Society' });
    });

    it('maps assault 3 (344) → 13B Violent', () => {
      expect(mapKyToNibrs('344')).toEqual({ code: '13B', category: 'Violent' });
    });

    it('maps unknown code to Other', () => {
      expect(mapKyToNibrs('999')).toEqual({ code: '999', category: 'Other' });
    });
  });

  describe('transformNYCRecord', () => {
    const baseRecord: NYCRawRecord = {
      cmplnt_num: '298784667',
      cmplnt_fr_dt: '2024-12-09T00:00:00.000',
      cmplnt_fr_tm: '04:37:00',
      ky_cd: '114',
      ofns_desc: 'ARSON',
      law_cat_cd: 'FELONY',
      latitude: '40.79243',
      longitude: '-73.884228',
      addr_pct_cd: '114',
      boro_nm: 'QUEENS',
      patrol_boro: 'PATROL BORO QUEENS NORTH',
    };

    it('transforms a valid record', () => {
      const result = transformNYCRecord(baseRecord);
      expect(result).not.toBeNull();
      expect(result!.incident_id).toBe(298784667);
      expect(result!.city).toBe('nyc');
      expect(result!.occurred_date).toBe('2024-12-09');
      expect(result!.occurred_hour).toBe(4);
      expect(result!.nibrs_code).toBe('200');
      expect(result!.nibrs_category).toBe('Property');
      expect(result!.latitude).toBeCloseTo(40.79243);
      expect(result!.longitude).toBeCloseTo(-73.884228);
      expect(result!.district).toBe('114');
      expect(result!.neighborhood).toBe('QUEENS');
      expect(result!.precinct).toBe('PATROL BORO QUEENS NORTH');
      expect(result!.coord_precision).toBe('block');
    });

    it('handles missing coordinates → beat precision', () => {
      const record = { ...baseRecord, latitude: undefined, longitude: undefined };
      const result = transformNYCRecord(record);
      expect(result!.latitude).toBeNull();
      expect(result!.longitude).toBeNull();
      expect(result!.coord_precision).toBe('beat');
    });

    it('returns null when ky_cd is missing', () => {
      const record = { ...baseRecord, ky_cd: undefined };
      expect(transformNYCRecord(record)).toBeNull();
    });

    it('returns null when date is missing', () => {
      const record = { ...baseRecord, cmplnt_fr_dt: undefined };
      expect(transformNYCRecord(record)).toBeNull();
    });
  });
});
