import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import { validateCorridorRequest } from '../../src/routes/crimes.js';

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

const validRoute = {
  type: 'LineString',
  coordinates: [[-122.33, 47.60], [-122.34, 47.61], [-122.35, 47.62]],
};

const validBody = {
  route: validRoute,
  buffer_meters: 200,
  city: 'seattle',
  hour_start: 7,
  hour_end: 9,
  from: '2023-01',
  to: '2025-12',
};

describe('validateCorridorRequest', () => {
  it('accepts valid request', () => {
    const result = validateCorridorRequest(validBody);
    expect(result.valid).toBe(true);
  });

  it('rejects missing body', () => {
    const result = validateCorridorRequest(null);
    expect(result.valid).toBe(false);
  });

  it('rejects invalid city', () => {
    const result = validateCorridorRequest({ ...validBody, city: 'tokyo' });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('city');
  });

  it('rejects missing route', () => {
    const noRoute = { city: validBody.city, buffer_meters: validBody.buffer_meters };
    const result = validateCorridorRequest(noRoute);
    expect(result.valid).toBe(false);
  });

  it('rejects non-LineString route', () => {
    const result = validateCorridorRequest({ ...validBody, route: { type: 'Point', coordinates: [0, 0] } });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('LineString');
  });

  it('rejects route with fewer than 2 coordinates', () => {
    const result = validateCorridorRequest({
      ...validBody,
      route: { type: 'LineString', coordinates: [[-122.33, 47.60]] },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('at least 2');
  });

  it('rejects buffer_meters exceeding max', () => {
    const result = validateCorridorRequest({ ...validBody, buffer_meters: 5000 });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('buffer_meters');
  });

  it('uses default buffer when not specified', () => {
    const noBuffer = { route: validBody.route, city: validBody.city };
    const result = validateCorridorRequest(noBuffer);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.buffer_meters).toBe(200);
  });

  it('rejects invalid hour_start', () => {
    const result = validateCorridorRequest({ ...validBody, hour_start: 25 });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('hour_start');
  });

  it('rejects invalid hour_end', () => {
    const result = validateCorridorRequest({ ...validBody, hour_end: -1 });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('hour_end');
  });

  it('rejects invalid from date format', () => {
    const result = validateCorridorRequest({ ...validBody, from: '2023/01' });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('YYYY-MM');
  });
});

describe('POST /api/crimes/corridor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns corridor crimes with category breakdown', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        { incident_id: 1, nibrs_category: 'Violent', latitude: 47.60, longitude: -122.33 },
        { incident_id: 2, nibrs_category: 'Property', latitude: 47.61, longitude: -122.34 },
        { incident_id: 3, nibrs_category: 'Property', latitude: 47.62, longitude: -122.35 },
      ],
    });

    const res = await supertest(app)
      .post('/api/crimes/corridor')
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.meta.total).toBe(3);
    expect(res.body.meta.buffer_meters).toBe(200);
    expect(res.body.meta.hour_range).toEqual([7, 9]);
    expect(res.body.meta.by_category.Violent).toBe(1);
    expect(res.body.meta.by_category.Property).toBe(2);
  });

  it('uses PostGIS ST_DWithin and ST_GeomFromGeoJSON in query', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    await supertest(app)
      .post('/api/crimes/corridor')
      .send(validBody);

    const sql = mockPoolQuery.mock.calls[0][0];
    expect(sql).toContain('ST_DWithin');
    expect(sql).toContain('ST_GeomFromGeoJSON');
  });

  it('includes hour filter in query', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    await supertest(app)
      .post('/api/crimes/corridor')
      .send(validBody);

    const sql = mockPoolQuery.mock.calls[0][0];
    expect(sql).toContain('occurred_hour');
  });

  it('handles hour wrap-around (e.g. 22 to 6)', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    await supertest(app)
      .post('/api/crimes/corridor')
      .send({ ...validBody, hour_start: 22, hour_end: 6 });

    const sql = mockPoolQuery.mock.calls[0][0];
    // Should use OR for wrap-around
    expect(sql).toContain('OR');
  });

  it('returns 400 for invalid request body', async () => {
    const res = await supertest(app)
      .post('/api/crimes/corridor')
      .send({ city: 'invalid' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 for missing route', async () => {
    const res = await supertest(app)
      .post('/api/crimes/corridor')
      .send({ city: 'seattle' });

    expect(res.status).toBe(400);
  });

  it('returns empty data when no crimes in corridor', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await supertest(app)
      .post('/api/crimes/corridor')
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
    expect(res.body.meta.by_category).toEqual({ Violent: 0, Property: 0, Society: 0, Other: 0 });
  });

  it('handles DB errors gracefully', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('DB error'));

    const res = await supertest(app)
      .post('/api/crimes/corridor')
      .send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });

  it('works without optional hour and date filters', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await supertest(app)
      .post('/api/crimes/corridor')
      .send({ route: validRoute, city: 'seattle' });

    expect(res.status).toBe(200);
    expect(res.body.meta.hour_range).toBeNull();
  });
});
