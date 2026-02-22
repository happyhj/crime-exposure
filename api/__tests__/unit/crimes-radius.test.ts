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

  it('filters by hour_start and hour_end', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [
        { incident_id: 1, nibrs_category: 'Property' },
        { incident_id: 2, nibrs_category: 'Property' },
      ] });

    const res = await supertest(app)
      .get('/api/crimes?lat=47.6&lon=-122.3&radius=1km&hour_start=8&hour_end=18');

    expect(res.status).toBe(200);
    const sql = mockPoolQuery.mock.calls[0][0];
    expect(sql).toContain('occurred_hour');
    expect(res.body.meta.hour_range).toEqual([8, 18]);
  });

  it('supports hour wrap-around (e.g. 22 to 6)', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await supertest(app)
      .get('/api/crimes?lat=47.6&lon=-122.3&radius=1km&hour_start=22&hour_end=6');

    const sql = mockPoolQuery.mock.calls[0][0];
    expect(sql).toContain('OR');
  });

  it('filters by nibrs_category', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ incident_id: 1, nibrs_category: 'Property' }] });

    const res = await supertest(app)
      .get('/api/crimes?lat=47.6&lon=-122.3&radius=1km&nibrs_category=Property');

    expect(res.status).toBe(200);
    const sql = mockPoolQuery.mock.calls[0][0];
    expect(sql).toContain('nibrs_category');
  });

  it('returns 400 for invalid nibrs_category', async () => {
    const res = await supertest(app)
      .get('/api/crimes?lat=47.6&lon=-122.3&radius=1km&nibrs_category=Invalid');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('nibrs_category');
  });

  it('filters by city in radius search', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await supertest(app)
      .get('/api/crimes?lat=47.6&lon=-122.3&radius=1km&city=seattle');

    const sql = mockPoolQuery.mock.calls[0][0];
    expect(sql).toContain('city');
  });

  it('returns by_category breakdown in meta', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: [
        { incident_id: 1, nibrs_category: 'Violent' },
        { incident_id: 2, nibrs_category: 'Property' },
        { incident_id: 3, nibrs_category: 'Property' },
      ] });

    const res = await supertest(app)
      .get('/api/crimes?lat=47.6&lon=-122.3&radius=1km');

    expect(res.status).toBe(200);
    expect(res.body.meta.by_category).toEqual({
      Violent: 1, Property: 2, Society: 0, Other: 0,
    });
  });

  it('filters by date range', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await supertest(app)
      .get('/api/crimes?lat=47.6&lon=-122.3&radius=1km&from=2024-01&to=2024-12');

    const sql = mockPoolQuery.mock.calls[0][0];
    expect(sql).toContain('occurred_date');
  });
});
