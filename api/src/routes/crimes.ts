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

export function createCrimesRouter(pool: pg.Pool): Router {
  const router = Router();

  // GET /api/crimes?city=seattle&from=2023-01&to=2025-12
  router.get('/', async (req: Request, res: Response) => {
    const { city, from, to, nibrs_category } = req.query;
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;

    // Validation
    if (!city || typeof city !== 'string' || !VALID_CITIES.has(city)) {
      res.status(400).json({
        error: `Invalid city. Must be one of: ${[...VALID_CITIES].join(', ')}`,
      });
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
      res.status(400).json({
        error: `Invalid nibrs_category. Must be one of: ${[...VALID_CATEGORIES].join(', ')}`,
      });
      return;
    }

    const fromDate = `${from}-01`;
    // Last day of the 'to' month
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
      // Count query
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM crime_incidents ${whereClause}`,
        params,
      );
      const total = Number(countResult.rows[0].count);

      // Data query
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
  });

  return router;
}
