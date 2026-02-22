import { describe, it, expect } from 'vitest';
import {
  isCoordMissing,
  parseLADateTime,
  mapCrmToNibrs,
  transformLARecord,
  type LARawRecord,
} from '../../src/adapters/la.js';

describe('LAAdapter', () => {
  describe('isCoordMissing', () => {
    it('detects (0, 0) sentinel', () => {
      expect(isCoordMissing('0', '0')).toBe(true);
    });

    it('detects (0.0, 0.0) sentinel', () => {
      expect(isCoordMissing('0.0', '0.0')).toBe(true);
    });

    it('detects missing lat', () => {
      expect(isCoordMissing(undefined, '-118.2437')).toBe(true);
    });

    it('detects missing lon', () => {
      expect(isCoordMissing('34.0522', undefined)).toBe(true);
    });

    it('detects empty strings', () => {
      expect(isCoordMissing('', '')).toBe(true);
    });

    it('passes valid coordinates', () => {
      expect(isCoordMissing('34.0522', '-118.2437')).toBe(false);
    });

    it('passes negative latitudes', () => {
      expect(isCoordMissing('-34.0522', '-118.2437')).toBe(false);
    });
  });

  describe('parseLADateTime', () => {
    it('parses ISO 8601 date and 4-digit time', () => {
      const result = parseLADateTime('2024-03-15T00:00:00.000', '0845');
      expect(result.date).toBe('2024-03-15');
      expect(result.hour).toBe(8);
    });

    it('parses midnight time', () => {
      const result = parseLADateTime('2024-01-01T00:00:00.000', '0000');
      expect(result.date).toBe('2024-01-01');
      expect(result.hour).toBe(0);
    });

    it('parses 23:00 time', () => {
      const result = parseLADateTime('2024-12-31T00:00:00.000', '2300');
      expect(result.date).toBe('2024-12-31');
      expect(result.hour).toBe(23);
    });

    it('returns null hour when time_occ is missing', () => {
      const result = parseLADateTime('2024-03-15T00:00:00.000');
      expect(result.date).toBe('2024-03-15');
      expect(result.hour).toBeNull();
    });

    it('returns null hour when time_occ is empty', () => {
      const result = parseLADateTime('2024-03-15T00:00:00.000', '');
      expect(result.hour).toBeNull();
    });
  });

  describe('mapCrmToNibrs', () => {
    it('maps homicide (110) → 09A Violent', () => {
      const result = mapCrmToNibrs('110');
      expect(result).toEqual({ code: '09A', category: 'Violent' });
    });

    it('maps robbery (210) → 120 Violent', () => {
      const result = mapCrmToNibrs('210');
      expect(result).toEqual({ code: '120', category: 'Violent' });
    });

    it('maps burglary (310) → 220 Property', () => {
      const result = mapCrmToNibrs('310');
      expect(result).toEqual({ code: '220', category: 'Property' });
    });

    it('maps vehicle stolen (510) → 240 Property', () => {
      const result = mapCrmToNibrs('510');
      expect(result).toEqual({ code: '240', category: 'Property' });
    });

    it('maps arson (648) → 200 Property', () => {
      const result = mapCrmToNibrs('648');
      expect(result).toEqual({ code: '200', category: 'Property' });
    });

    it('maps simple assault (624) → 13B Violent', () => {
      const result = mapCrmToNibrs('624');
      expect(result).toEqual({ code: '13B', category: 'Violent' });
    });

    it('maps unknown code to Other with original code', () => {
      const result = mapCrmToNibrs('999');
      expect(result).toEqual({ code: '999', category: 'Other' });
    });
  });

  describe('transformLARecord', () => {
    const baseRecord: LARawRecord = {
      dr_no: '240001234',
      date_occ: '2024-06-15T00:00:00.000',
      time_occ: '1430',
      crm_cd: '310',
      crm_cd_desc: 'BURGLARY',
      lat: '34.0522',
      lon: '-118.2437',
      area: '01',
      area_name: 'Central',
      rpt_dist_no: '0163',
    };

    it('transforms a valid record', () => {
      const result = transformLARecord(baseRecord);
      expect(result).not.toBeNull();
      expect(result!.incident_id).toBe(240001234);
      expect(result!.city).toBe('la');
      expect(result!.occurred_date).toBe('2024-06-15');
      expect(result!.occurred_hour).toBe(14);
      expect(result!.nibrs_code).toBe('220');
      expect(result!.nibrs_category).toBe('Property');
      expect(result!.latitude).toBe(34.0522);
      expect(result!.longitude).toBe(-118.2437);
      expect(result!.district).toBe('0163');
      expect(result!.neighborhood).toBe('Central');
      expect(result!.precinct).toBe('01');
      expect(result!.coord_precision).toBe('block');
    });

    it('handles (0,0) sentinel → coord_precision=beat', () => {
      const record = { ...baseRecord, lat: '0', lon: '0' };
      const result = transformLARecord(record);
      expect(result!.latitude).toBeNull();
      expect(result!.longitude).toBeNull();
      expect(result!.coord_precision).toBe('beat');
    });

    it('returns null when crm_cd is missing', () => {
      const record = { ...baseRecord, crm_cd: undefined };
      expect(transformLARecord(record)).toBeNull();
    });

    it('handles missing time_occ', () => {
      const record = { ...baseRecord, time_occ: undefined };
      const result = transformLARecord(record);
      expect(result!.occurred_hour).toBeNull();
    });
  });
});
