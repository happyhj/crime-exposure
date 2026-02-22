import { Router } from 'express';
import type { Request, Response } from 'express';
import type pg from 'pg';

const VALID_CITIES = new Set(['seattle', 'chicago', 'la', 'dallas', 'nyc']);
const VALID_CATEGORIES = new Set(['Violent', 'Property', 'Society', 'Other']);
const MAX_LIMIT = 50_000;
const DEFAULT_LIMIT = 10_000;

function validateDate(dateStr: string): boolean {
  return /^\d{4}-\d{2}$/.test(dateStr);
}

/**
 * Parse radius string like "2km" or "500m" to meters.
 */
export function parseRadius(radius: string): number | null {
  const match = radius.match(/^(\d+(?:\.\d+)?)(km|m)$/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  return unit === 'km' ? value * 1000 : value;
}

export function createCrimesRouter(pool: pg.Pool): Router {
  const router = Router();

  // GET /api/crimes?city=seattle&from=2023-01&to=2025-12
  // GET /api/crimes?lat=47.6&lon=-122.3&radius=2km
  router.get('/', async (req: Request, res: Response) => {
    const { lat, lon, radius } = req.query;
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;

    // Radius search mode
    if (lat && lon && radius) {
      return handleRadiusSearch(req, res, pool, limit, offset);
    }

    // City + date range mode
    return handleCitySearch(req, res, pool, limit, offset);
  });

  // GET /api/crimes/stats?city=seattle&groupBy=hour
  // GET /api/crimes/stats?city=seattle&groupBy=nibrs_category
  router.get('/stats', async (req: Request, res: Response) => {
    const { city, groupBy, from, to } = req.query;

    if (!city || typeof city !== 'string' || !VALID_CITIES.has(city)) {
      res.status(400).json({ error: `Invalid city. Must be one of: ${[...VALID_CITIES].join(', ')}` });
      return;
    }
    const validGroupBy = ['hour', 'nibrs_category', 'nibrs_code'];
    if (!groupBy || !validGroupBy.includes(groupBy as string)) {
      res.status(400).json({ error: `Invalid groupBy. Must be one of: ${validGroupBy.join(', ')}` });
      return;
    }

    const params: unknown[] = [city];
    let whereClause = 'WHERE city = $1';
    let paramIdx = 2;

    if (from && typeof from === 'string' && validateDate(from)) {
      whereClause += ` AND occurred_date >= $${paramIdx}`;
      params.push(`${from}-01`);
      paramIdx++;
    }
    if (to && typeof to === 'string' && validateDate(to)) {
      const [toYear, toMonth] = to.split('-').map(Number);
      const toDate = new Date(toYear, toMonth, 0).toISOString().slice(0, 10);
      whereClause += ` AND occurred_date <= $${paramIdx}`;
      params.push(toDate);
      paramIdx++;
    }

    try {
      const groupColMap: Record<string, string> = {
        hour: 'occurred_hour',
        nibrs_category: 'nibrs_category',
        nibrs_code: 'nibrs_code',
      };
      const groupCol = groupColMap[groupBy as string];
      // For nibrs_code, also return the parent category for grouping
      const selectExtra = groupBy === 'nibrs_code' ? ', nibrs_category as category' : '';
      const groupExtra = groupBy === 'nibrs_code' ? ', nibrs_category' : '';
      const result = await pool.query(
        `SELECT ${groupCol} as key, COUNT(*) as count${selectExtra} FROM crime_incidents ${whereClause} GROUP BY ${groupCol}${groupExtra} ORDER BY count DESC`,
        params,
      );

      res.json({
        data: result.rows.map(r => ({
          key: r.key,
          count: Number(r.count),
          ...(r.category ? { category: r.category } : {}),
        })),
        groupBy,
        city,
      });
    } catch (err) {
      console.error('Error querying stats:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/crimes/corridor
  router.post('/corridor', async (req: Request, res: Response) => {
    return handleCorridorSearch(req, res, pool);
  });

  return router;
}

export interface CorridorRequest {
  route: {
    type: 'LineString';
    coordinates: number[][];
  };
  buffer_meters?: number;
  city: string;
  hour_start?: number;
  hour_end?: number;
  from?: string;
  to?: string;
}

const MAX_BUFFER = 2000;
const DEFAULT_BUFFER = 200;

export function validateCorridorRequest(body: unknown): { valid: true; data: CorridorRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const b = body as Record<string, unknown>;

  // city
  if (!b.city || typeof b.city !== 'string' || !VALID_CITIES.has(b.city)) {
    return { valid: false, error: `Invalid city. Must be one of: ${[...VALID_CITIES].join(', ')}` };
  }

  // route
  if (!b.route || typeof b.route !== 'object') {
    return { valid: false, error: 'route is required and must be a GeoJSON LineString' };
  }
  const route = b.route as Record<string, unknown>;
  if (route.type !== 'LineString') {
    return { valid: false, error: 'route.type must be "LineString"' };
  }
  if (!Array.isArray(route.coordinates) || route.coordinates.length < 2) {
    return { valid: false, error: 'route.coordinates must be an array of at least 2 coordinate pairs' };
  }
  for (const coord of route.coordinates) {
    if (!Array.isArray(coord) || coord.length < 2 || typeof coord[0] !== 'number' || typeof coord[1] !== 'number') {
      return { valid: false, error: 'Each coordinate must be [lon, lat] number pair' };
    }
  }

  // buffer_meters
  const buffer = b.buffer_meters != null ? Number(b.buffer_meters) : DEFAULT_BUFFER;
  if (isNaN(buffer) || buffer <= 0 || buffer > MAX_BUFFER) {
    return { valid: false, error: `buffer_meters must be between 1 and ${MAX_BUFFER}` };
  }

  // hour_start / hour_end
  if (b.hour_start != null) {
    const h = Number(b.hour_start);
    if (isNaN(h) || h < 0 || h > 23 || !Number.isInteger(h)) {
      return { valid: false, error: 'hour_start must be an integer between 0 and 23' };
    }
  }
  if (b.hour_end != null) {
    const h = Number(b.hour_end);
    if (isNaN(h) || h < 0 || h > 23 || !Number.isInteger(h)) {
      return { valid: false, error: 'hour_end must be an integer between 0 and 23' };
    }
  }

  // from / to dates
  if (b.from != null && (typeof b.from !== 'string' || !validateDate(b.from))) {
    return { valid: false, error: 'from must be in YYYY-MM format' };
  }
  if (b.to != null && (typeof b.to !== 'string' || !validateDate(b.to))) {
    return { valid: false, error: 'to must be in YYYY-MM format' };
  }

  return {
    valid: true,
    data: {
      route: route as CorridorRequest['route'],
      buffer_meters: buffer,
      city: b.city as string,
      hour_start: b.hour_start != null ? Number(b.hour_start) : undefined,
      hour_end: b.hour_end != null ? Number(b.hour_end) : undefined,
      from: b.from as string | undefined,
      to: b.to as string | undefined,
    },
  };
}

async function handleCorridorSearch(req: Request, res: Response, pool: pg.Pool) {
  const validation = validateCorridorRequest(req.body);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const { route, buffer_meters, city, hour_start, hour_end, from, to } = validation.data;
  const routeGeoJson = JSON.stringify(route);
  const buffer = buffer_meters ?? DEFAULT_BUFFER;

  const params: unknown[] = [city, routeGeoJson, buffer];
  let paramIdx = 4;
  let whereClause = `WHERE city = $1 AND latitude IS NOT NULL AND ST_DWithin(
    ST_MakePoint(longitude, latitude)::geography,
    ST_GeomFromGeoJSON($2)::geography,
    $3
  )`;

  // Hour range filter — supports wrap-around (e.g. 22 → 6)
  if (hour_start != null && hour_end != null) {
    if (hour_start <= hour_end) {
      whereClause += ` AND occurred_hour >= $${paramIdx} AND occurred_hour <= $${paramIdx + 1}`;
    } else {
      // Wrap-around: e.g. 22 to 6 means (>= 22 OR <= 6)
      whereClause += ` AND (occurred_hour >= $${paramIdx} OR occurred_hour <= $${paramIdx + 1})`;
    }
    params.push(hour_start, hour_end);
    paramIdx += 2;
  } else if (hour_start != null) {
    whereClause += ` AND occurred_hour >= $${paramIdx}`;
    params.push(hour_start);
    paramIdx++;
  } else if (hour_end != null) {
    whereClause += ` AND occurred_hour <= $${paramIdx}`;
    params.push(hour_end);
    paramIdx++;
  }

  // Date range filter
  if (from) {
    whereClause += ` AND occurred_date >= $${paramIdx}`;
    params.push(`${from}-01`);
    paramIdx++;
  }
  if (to) {
    const [toYear, toMonth] = to.split('-').map(Number);
    const toDate = new Date(toYear, toMonth, 0).toISOString().slice(0, 10);
    whereClause += ` AND occurred_date <= $${paramIdx}`;
    params.push(toDate);
    paramIdx++;
  }

  try {
    // Get crimes with category breakdown
    const dataResult = await pool.query(
      `SELECT incident_id, city, occurred_date, occurred_hour, nibrs_code, nibrs_category, latitude, longitude
       FROM crime_incidents ${whereClause}
       ORDER BY occurred_date DESC, incident_id
       LIMIT 50000`,
      params,
    );

    // Category breakdown
    const byCategory: Record<string, number> = { Violent: 0, Property: 0, Society: 0, Other: 0 };
    for (const row of dataResult.rows) {
      const cat = row.nibrs_category as string;
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    }

    res.json({
      data: dataResult.rows,
      meta: {
        total: dataResult.rows.length,
        buffer_meters: buffer,
        hour_range: hour_start != null && hour_end != null ? [hour_start, hour_end] : null,
        by_category: byCategory,
      },
    });
  } catch (err) {
    console.error('Error querying corridor crimes:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleCitySearch(req: Request, res: Response, pool: pg.Pool, limit: number, offset: number) {
  const { city, from, to, nibrs_category } = req.query;

  if (!city || typeof city !== 'string' || !VALID_CITIES.has(city)) {
    res.status(400).json({ error: `Invalid city. Must be one of: ${[...VALID_CITIES].join(', ')}` });
    return;
  }
  if (!from || typeof from !== 'string' || !validateDate(from)) {
    res.status(400).json({ error: 'Invalid from date. Must be YYYY-MM format.' });
    return;
  }
  if (!to || typeof to !== 'string' || !validateDate(to)) {
    res.status(400).json({ error: 'Invalid to date. Must be YYYY-MM format.' });
    return;
  }
  if (nibrs_category && !VALID_CATEGORIES.has(nibrs_category as string)) {
    res.status(400).json({ error: `Invalid nibrs_category. Must be one of: ${[...VALID_CATEGORIES].join(', ')}` });
    return;
  }

  const fromDate = `${from}-01`;
  const [toYear, toMonth] = to.split('-').map(Number);
  const toDate = new Date(toYear, toMonth, 0).toISOString().slice(0, 10);

  const params: unknown[] = [city, fromDate, toDate];
  let whereClause = 'WHERE city = $1 AND occurred_date >= $2 AND occurred_date <= $3';
  let paramIdx = 4;

  if (nibrs_category) {
    whereClause += ` AND nibrs_category = $${paramIdx}`;
    params.push(nibrs_category);
    paramIdx++;
  }

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM crime_incidents ${whereClause}`,
      params,
    );
    const total = Number(countResult.rows[0].count);

    const dataParams = [...params, limit, offset];
    const dataResult = await pool.query(
      `SELECT * FROM crime_incidents ${whereClause} ORDER BY occurred_date DESC, incident_id LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      dataParams,
    );

    res.json({
      data: dataResult.rows,
      meta: { total, limit, offset },
    });
  } catch (err) {
    console.error('Error querying crimes:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleRadiusSearch(req: Request, res: Response, pool: pg.Pool, limit: number, offset: number) {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const radiusStr = req.query.radius as string;

  if (isNaN(lat) || lat < -90 || lat > 90) {
    res.status(400).json({ error: 'Invalid lat. Must be between -90 and 90.' });
    return;
  }
  if (isNaN(lon) || lon < -180 || lon > 180) {
    res.status(400).json({ error: 'Invalid lon. Must be between -180 and 180.' });
    return;
  }

  const radiusMeters = parseRadius(radiusStr);
  if (radiusMeters === null || radiusMeters <= 0) {
    res.status(400).json({ error: 'Invalid radius. Must be like "2km" or "500m".' });
    return;
  }

  // Optional filters
  const { city, nibrs_category, hour_start, hour_end, from, to } = req.query;

  if (city && (typeof city !== 'string' || !VALID_CITIES.has(city))) {
    res.status(400).json({ error: `Invalid city. Must be one of: ${[...VALID_CITIES].join(', ')}` });
    return;
  }
  if (nibrs_category && !VALID_CATEGORIES.has(nibrs_category as string)) {
    res.status(400).json({ error: `Invalid nibrs_category. Must be one of: ${[...VALID_CATEGORIES].join(', ')}` });
    return;
  }

  const params: unknown[] = [lon, lat, radiusMeters];
  let paramIdx = 4;
  let whereClause = `WHERE latitude IS NOT NULL AND ST_DWithin(
      ST_MakePoint(longitude, latitude)::geography,
      ST_MakePoint($1, $2)::geography,
      $3
    )`;

  if (city) {
    whereClause += ` AND city = $${paramIdx}`;
    params.push(city);
    paramIdx++;
  }

  if (nibrs_category) {
    whereClause += ` AND nibrs_category = $${paramIdx}`;
    params.push(nibrs_category);
    paramIdx++;
  }

  // Hour range filter with wrap-around support
  if (hour_start != null && hour_end != null) {
    const hs = Number(hour_start);
    const he = Number(hour_end);
    if (!isNaN(hs) && !isNaN(he) && hs >= 0 && hs <= 23 && he >= 0 && he <= 23) {
      if (hs <= he) {
        whereClause += ` AND occurred_hour >= $${paramIdx} AND occurred_hour <= $${paramIdx + 1}`;
      } else {
        whereClause += ` AND (occurred_hour >= $${paramIdx} OR occurred_hour <= $${paramIdx + 1})`;
      }
      params.push(hs, he);
      paramIdx += 2;
    }
  } else if (hour_start != null) {
    const hs = Number(hour_start);
    if (!isNaN(hs) && hs >= 0 && hs <= 23) {
      whereClause += ` AND occurred_hour >= $${paramIdx}`;
      params.push(hs);
      paramIdx++;
    }
  } else if (hour_end != null) {
    const he = Number(hour_end);
    if (!isNaN(he) && he >= 0 && he <= 23) {
      whereClause += ` AND occurred_hour <= $${paramIdx}`;
      params.push(he);
      paramIdx++;
    }
  }

  // Date range filter
  if (from && typeof from === 'string' && validateDate(from)) {
    whereClause += ` AND occurred_date >= $${paramIdx}`;
    params.push(`${from}-01`);
    paramIdx++;
  }
  if (to && typeof to === 'string' && validateDate(to)) {
    const [toYear, toMonth] = to.split('-').map(Number);
    const toDate = new Date(toYear, toMonth, 0).toISOString().slice(0, 10);
    whereClause += ` AND occurred_date <= $${paramIdx}`;
    params.push(toDate);
    paramIdx++;
  }

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM crime_incidents ${whereClause}`,
      params,
    );
    const total = Number(countResult.rows[0].count);

    const dataParams = [...params, limit, offset];
    const dataResult = await pool.query(
      `SELECT * FROM crime_incidents ${whereClause} ORDER BY occurred_date DESC, incident_id LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      dataParams,
    );

    // Category breakdown
    const byCategory: Record<string, number> = { Violent: 0, Property: 0, Society: 0, Other: 0 };
    for (const row of dataResult.rows) {
      const cat = row.nibrs_category as string;
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    }

    res.json({
      data: dataResult.rows,
      meta: {
        total,
        limit,
        offset,
        radius_meters: radiusMeters,
        by_category: byCategory,
        hour_range: hour_start != null && hour_end != null ? [Number(hour_start), Number(hour_end)] : null,
      },
    });
  } catch (err) {
    console.error('Error querying radius crimes:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
