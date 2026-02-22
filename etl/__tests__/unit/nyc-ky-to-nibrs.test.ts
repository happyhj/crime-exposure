import { describe, it, expect } from 'vitest';
import mapping from '../../src/mappings/nyc-ky-to-nibrs.json';

describe('NYC ky_cd → NIBRS mapping', () => {
  const entries = Object.entries(mapping);

  it('has at least 60 entries', () => {
    expect(entries.length).toBeGreaterThanOrEqual(60);
  });

  it('every entry has nibrs_code and category', () => {
    for (const [kyCd, entry] of entries) {
      const e = entry as { nibrs_code: string; category: string };
      expect(e.nibrs_code, `ky_cd ${kyCd} missing nibrs_code`).toBeTruthy();
      expect(e.category, `ky_cd ${kyCd} missing category`).toBeTruthy();
    }
  });

  it('category values are valid', () => {
    const validCategories = ['Violent', 'Property', 'Society', 'Other'];
    for (const [kyCd, entry] of entries) {
      const e = entry as { nibrs_code: string; category: string };
      expect(validCategories, `ky_cd ${kyCd} has invalid category: ${e.category}`).toContain(e.category);
    }
  });

  it('covers key crime types', () => {
    const m = mapping as Record<string, { nibrs_code: string; category: string }>;
    expect(m['101']).toBeDefined(); // Murder
    expect(m['104']).toBeDefined(); // Rape
    expect(m['105']).toBeDefined(); // Robbery
    expect(m['106']).toBeDefined(); // Assault
    expect(m['107']).toBeDefined(); // Burglary
    expect(m['109']).toBeDefined(); // Grand Larceny
    expect(m['110']).toBeDefined(); // Grand Larceny MV
  });
});
