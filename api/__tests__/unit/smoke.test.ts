import { describe, it, expect } from 'vitest';

describe('API package', () => {
  it('is importable', async () => {
    const mod = await import('../../src/index.js');
    expect(mod).toBeDefined();
  });
});
