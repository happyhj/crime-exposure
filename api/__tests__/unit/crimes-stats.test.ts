import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';

const mockPoolQuery = vi.fn();
vi.mock('pg', () => ({
  default: {
    Pool: vi.fn().mockImplementation(() => ({
      query: mockPoolQuery,
      end: vi.fn(),
    })),
  },
}));

import { createApp } from '../../src/server.js';

const { app } = createApp({
  db: { host: 'localhost', port: 5432, database: 'test', user: 'test', password: 'test' },
});

describe('GET /api/crimes/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns hour grouping stats', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        { key: 0, count: '10' },
        { key: 12, count: '25' },
        { key: 23, count: '8' },
      ],
    });

    const res = await supertest(app)
      .get('/api/crimes/stats?city=seattle&groupBy=hour');

    expect(res.status).toBe(200);
    expect(res.body.groupBy).toBe('hour');
    expect(res.body.city).toBe('seattle');
    expect(res.body.data).toEqual([
      { key: 0, count: 10 },
      { key: 12, count: 25 },
      { key: 23, count: 8 },
    ]);
  });

  it('returns nibrs_category grouping stats', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        { key: 'Property', count: '500' },
        { key: 'Violent', count: '100' },
      ],
    });

    const res = await supertest(app)
      .get('/api/crimes/stats?city=seattle&groupBy=nibrs_category');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { key: 'Property', count: 500 },
      { key: 'Violent', count: 100 },
    ]);
  });

  it('returns 400 for missing city', async () => {
    const res = await supertest(app)
      .get('/api/crimes/stats?groupBy=hour');

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid groupBy', async () => {
    const res = await supertest(app)
      .get('/api/crimes/stats?city=seattle&groupBy=invalid');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('groupBy');
  });

  it('applies date filters when provided', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    await supertest(app)
      .get('/api/crimes/stats?city=seattle&groupBy=hour&from=2024-01&to=2024-12');

    const sql = mockPoolQuery.mock.calls[0][0];
    expect(sql).toContain('occurred_date >=');
    expect(sql).toContain('occurred_date <=');
  });
});
