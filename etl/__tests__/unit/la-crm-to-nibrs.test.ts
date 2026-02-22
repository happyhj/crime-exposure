import { describe, it, expect } from 'vitest';
import mapping from '../../src/mappings/la-crm-to-nibrs.json';

describe('LA crm_cd → NIBRS mapping', () => {
  const entries = Object.entries(mapping);

  it('has at least 140 entries', () => {
    expect(entries.length).toBeGreaterThanOrEqual(140);
  });

  it('every entry has nibrs_code and category', () => {
    for (const [crmCd, entry] of entries) {
      const e = entry as { nibrs_code: string; category: string };
      expect(e.nibrs_code, `crm_cd ${crmCd} missing nibrs_code`).toBeTruthy();
      expect(e.category, `crm_cd ${crmCd} missing category`).toBeTruthy();
    }
  });

  it('category values are valid', () => {
    const validCategories = ['Violent', 'Property', 'Society', 'Other'];
    for (const [crmCd, entry] of entries) {
      const e = entry as { nibrs_code: string; category: string };
      expect(validCategories, `crm_cd ${crmCd} has invalid category: ${e.category}`).toContain(e.category);
    }
  });

  it('covers key crime types', () => {
    const m = mapping as Record<string, { nibrs_code: string; category: string }>;
    // Homicide
    expect(m['110']).toBeDefined();
    expect(m['110'].category).toBe('Violent');
    // Robbery
    expect(m['210']).toBeDefined();
    expect(m['210'].category).toBe('Violent');
    // Burglary
    expect(m['310']).toBeDefined();
    expect(m['310'].category).toBe('Property');
    // Vehicle theft
    expect(m['510']).toBeDefined();
    expect(m['510'].category).toBe('Property');
    // Simple assault
    expect(m['624']).toBeDefined();
    expect(m['624'].category).toBe('Violent');
  });
});
