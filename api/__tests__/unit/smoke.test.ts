import { describe, it, expect } from 'vitest';

describe('API package', () => {
  it('server module is importable', async () => {
    const mod = await import('../../src/server.js');
    expect(mod.createApp).toBeDefined();
    expect(typeof mod.createApp).toBe('function');
  });
});
