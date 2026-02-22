import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import { parseRadius } from '../../src/routes/crimes.js';

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

describe('parseRadius', () => {
  it('parses "2km" to 2000 meters', () => {
    expect(parseRadius('2km')).toBe(2000);
  });

  it('parses "500m" to 500 meters', () => {
    expect(parseRadius('500m')).toBe(500);
  });

  it('parses "1.5km" to 1500 meters', () => {
    expect(parseRadius('1.5km')).toBe(1500);
  });

  it('returns null for invalid format', () => {
    expect(parseRadius('abc')).toBeNull();
    expect(parseRadius('2')).toBeNull();
    expect(parseRadius('km')).toBeNull();
  });
});

describe('GET /api/crimes (radius search)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns radius search results', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: [{ incident_id: 1 }] });

    const res = await supertest(app)
      .get('/api/crimes?lat=47.6&lon=-122.3&radius=2km');

    expect(res.status).toBe(200);
    expect(res.body.meta.radius_meters).toBe(2000);
  });

  it('returns 400 for invalid lat', async () => {
    const res = await supertest(app)
      .get('/api/crimes?lat=999&lon=-122.3&radius=2km');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('lat');
  });

  it('returns 400 for invalid lon', async () => {
    const res = await supertest(app)
      .get('/api/crimes?lat=47.6&lon=999&radius=2km');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('lon');
  });

  it('returns 400 for invalid radius', async () => {
    const res = await supertest(app)
      .get('/api/crimes?lat=47.6&lon=-122.3&radius=abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('radius');
  });

  it('uses PostGIS ST_DWithin in query', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await supertest(app)
      .get('/api/crimes?lat=47.6&lon=-122.3&radius=1km');

    const sql = mockPoolQuery.mock.calls[0][0];
    expect(sql).toContain('ST_DWithin');
    expect(sql).toContain('ST_MakePoint');
  });
});
