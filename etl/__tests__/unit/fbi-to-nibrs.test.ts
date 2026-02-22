import { describe, it, expect } from 'vitest';
import mapping from '../../src/mappings/fbi-to-nibrs.json';

type MappingEntry = {
  nibrs_code: string;
  nibrs_category: string;
  description: string;
};

const entries = mapping as Record<string, MappingEntry>;

describe('fbi-to-nibrs mapping', () => {
  it('has at least 25 entries', () => {
    expect(Object.keys(entries).length).toBeGreaterThanOrEqual(25);
  });

  it('every entry has nibrs_code, nibrs_category, description', () => {
    for (const [fbiCode, entry] of Object.entries(entries)) {
      expect(entry.nibrs_code, `${fbiCode} missing nibrs_code`).toBeTruthy();
      expect(entry.nibrs_category, `${fbiCode} missing nibrs_category`).toBeTruthy();
      expect(entry.description, `${fbiCode} missing description`).toBeTruthy();
    }
  });

  it('nibrs_category is one of the 4 valid values', () => {
    const validCategories = new Set(['Violent', 'Property', 'Society', 'Other']);
    for (const [fbiCode, entry] of Object.entries(entries)) {
      expect(
        validCategories.has(entry.nibrs_category),
        `${fbiCode}: invalid category '${entry.nibrs_category}'`,
      ).toBe(true);
    }
  });

  it('covers key crime types from CLAUDE.md', () => {
    // Critical mappings from CLAUDE.md section 3.2
    expect(entries['01A'].nibrs_code).toBe('09A'); // Homicide
    expect(entries['02'].nibrs_code).toBe('11A');   // Sexual Assault
    expect(entries['03'].nibrs_code).toBe('120');    // Robbery
    expect(entries['04A'].nibrs_code).toBe('13A');  // Aggravated Assault
    expect(entries['05'].nibrs_code).toBe('220');    // Burglary
    expect(entries['06'].nibrs_code).toBe('23H');    // Larceny/Theft
    expect(entries['07'].nibrs_code).toBe('240');    // Motor Vehicle Theft
    expect(entries['08A'].nibrs_code).toBe('13B');  // Simple Assault
    expect(entries['09'].nibrs_code).toBe('200');    // Arson
  });

  it('no duplicate FBI codes', () => {
    const fbiCodes = Object.keys(entries);
    const uniqueCodes = new Set(fbiCodes);
    expect(fbiCodes.length).toBe(uniqueCodes.size);
  });
});
