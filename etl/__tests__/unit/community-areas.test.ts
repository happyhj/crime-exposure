import { describe, it, expect } from 'vitest';
import areas from '../../src/mappings/community-areas.json';

const mapping = areas as Record<string, string>;

describe('community-areas mapping', () => {
  it('has exactly 77 entries', () => {
    expect(Object.keys(mapping).length).toBe(77);
  });

  it('covers numbers 1-77 with no gaps', () => {
    for (let i = 1; i <= 77; i++) {
      expect(mapping[String(i)], `Missing community area ${i}`).toBeTruthy();
    }
  });

  it('every value is a non-empty string', () => {
    for (const [key, value] of Object.entries(mapping)) {
      expect(typeof value).toBe('string');
      expect(value.length, `Empty name for key ${key}`).toBeGreaterThan(0);
    }
  });

  it('contains well-known areas', () => {
    expect(mapping['32']).toBe('Loop');
    expect(mapping['1']).toBe('Rogers Park');
    expect(mapping['7']).toBe('Lincoln Park');
    expect(mapping['41']).toBe('Hyde Park');
  });
});
