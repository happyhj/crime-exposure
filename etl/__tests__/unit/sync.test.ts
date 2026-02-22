import { describe, it, expect } from 'vitest';

describe('sync utilities', () => {
  it('runSync is exported', async () => {
    const mod = await import('../../src/sync.js');
    expect(typeof mod.runSync).toBe('function');
  });
});
