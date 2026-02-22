import { describe, it, expect, vi, afterAll } from 'vitest';
import supertest from 'supertest';

// Mock pg Pool
const mockPoolQuery = vi.fn();
const mockPoolEnd = vi.fn();

vi.mock('pg', () => ({
  default: {
    Pool: vi.fn().mockImplementation(() => ({
      query: mockPoolQuery,
      end: mockPoolEnd,
    })),
  },
}));

import { createApp } from '../../src/server.js';

describe('GET /health', () => {
  const { app } = createApp({
    db: { host: 'localhost', port: 5432, database: 'test', user: 'test', password: 'test' },
  });

  afterAll(async () => {
    // no-op, pool is mocked
  });

  it('returns ok when DB is connected', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    const res = await supertest(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'connected' });
  });

  it('returns 503 when DB is disconnected', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('connection refused'));

    const res = await supertest(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', db: 'disconnected' });
  });
});
