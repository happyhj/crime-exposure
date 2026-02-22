import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';

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

const { app } = createApp({
  db: { host: 'localhost', port: 5432, database: 'test', user: 'test', password: 'test' },
});

describe('GET /api/crimes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns crime data with meta', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ count: '5' }] })  // COUNT query
      .mockResolvedValueOnce({ rows: [{ incident_id: 1, city: 'seattle' }] }); // SELECT query

    const res = await supertest(app)
      .get('/api/crimes?city=seattle&from=2024-01&to=2024-12');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toEqual({ total: 5, limit: 10000, offset: 0 });
  });

  it('returns 400 for missing city', async () => {
    const res = await supertest(app)
      .get('/api/crimes?from=2024-01&to=2024-12');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid city');
  });

  it('returns 400 for invalid city', async () => {
    const res = await supertest(app)
      .get('/api/crimes?city=invalid&from=2024-01&to=2024-12');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid city');
  });

  it('returns 400 for missing from date', async () => {
    const res = await supertest(app)
      .get('/api/crimes?city=seattle&to=2024-12');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('from date');
  });

  it('returns 400 for invalid from date format', async () => {
    const res = await supertest(app)
      .get('/api/crimes?city=seattle&from=2024&to=2024-12');

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid nibrs_category', async () => {
    const res = await supertest(app)
      .get('/api/crimes?city=seattle&from=2024-01&to=2024-12&nibrs_category=Invalid');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('nibrs_category');
  });

  it('applies nibrs_category filter in query', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: [] });

    await supertest(app)
      .get('/api/crimes?city=seattle&from=2024-01&to=2024-12&nibrs_category=Violent');

    // Verify the count query includes nibrs_category filter
    const countCall = mockPoolQuery.mock.calls[0];
    expect(countCall[0]).toContain('nibrs_category');
    expect(countCall[1]).toContain('Violent');
  });

  it('respects custom limit and offset', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ count: '100' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await supertest(app)
      .get('/api/crimes?city=seattle&from=2024-01&to=2024-12&limit=50&offset=10');

    expect(res.status).toBe(200);
    expect(res.body.meta.limit).toBe(50);
    expect(res.body.meta.offset).toBe(10);
  });

  it('caps limit at 50000', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await supertest(app)
      .get('/api/crimes?city=seattle&from=2024-01&to=2024-12&limit=999999');

    expect(res.body.meta.limit).toBe(50000);
  });

  it('returns 500 on database error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('DB error'));

    const res = await supertest(app)
      .get('/api/crimes?city=seattle&from=2024-01&to=2024-12');

    expect(res.status).toBe(500);
  });
});
