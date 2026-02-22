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
    if (!groupBy || (groupBy !== 'hour' && groupBy !== 'nibrs_category')) {
      res.status(400).json({ error: 'Invalid groupBy. Must be "hour" or "nibrs_category".' });
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
      const groupCol = groupBy === 'hour' ? 'occurred_hour' : 'nibrs_category';
      const result = await pool.query(
        `SELECT ${groupCol} as key, COUNT(*) as count FROM crime_incidents ${whereClause} GROUP BY ${groupCol} ORDER BY ${groupCol}`,
        params,
      );

      res.json({
        data: result.rows.map(r => ({ key: r.key, count: Number(r.count) })),
        groupBy,
        city,
      });
    } catch (err) {
      console.error('Error querying stats:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
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

  try {
    const whereClause = `WHERE latitude IS NOT NULL AND ST_DWithin(
      ST_MakePoint(longitude, latitude)::geography,
      ST_MakePoint($1, $2)::geography,
      $3
    )`;

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM crime_incidents ${whereClause}`,
      [lon, lat, radiusMeters],
    );
    const total = Number(countResult.rows[0].count);

    const dataResult = await pool.query(
      `SELECT * FROM crime_incidents ${whereClause} ORDER BY occurred_date DESC, incident_id LIMIT $4 OFFSET $5`,
      [lon, lat, radiusMeters, limit, offset],
    );

    res.json({
      data: dataResult.rows,
      meta: { total, limit, offset, radius_meters: radiusMeters },
    });
  } catch (err) {
    console.error('Error querying radius crimes:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
