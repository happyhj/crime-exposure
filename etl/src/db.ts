import pg from 'pg';
import type { StandardCrimeRecord } from './types.js';

const { Pool } = pg;

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

const BATCH_SIZE = 5_000;

const UPSERT_SQL = `
INSERT INTO crime_incidents (
  incident_id, city, occurred_date, occurred_hour, nibrs_code, nibrs_category,
  latitude, longitude, district, neighborhood, precinct, coord_precision
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
ON CONFLICT (incident_id) DO UPDATE SET
  city = EXCLUDED.city,
  occurred_date = EXCLUDED.occurred_date,
  occurred_hour = EXCLUDED.occurred_hour,
  nibrs_code = EXCLUDED.nibrs_code,
  nibrs_category = EXCLUDED.nibrs_category,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  district = EXCLUDED.district,
  neighborhood = EXCLUDED.neighborhood,
  precinct = EXCLUDED.precinct,
  coord_precision = EXCLUDED.coord_precision
`;

function recordToParams(r: StandardCrimeRecord): unknown[] {
  return [
    r.incident_id, r.city, r.occurred_date, r.occurred_hour,
    r.nibrs_code, r.nibrs_category,
    r.latitude, r.longitude,
    r.district, r.neighborhood, r.precinct, r.coord_precision,
  ];
}

export class CrimeDb {
  private pool: pg.Pool;

  constructor(config: DbConfig) {
    this.pool = new Pool(config);
  }

  /**
   * Upsert a batch of records in a single transaction.
   * Splits into chunks of BATCH_SIZE for large arrays.
   */
  async upsertBatch(records: StandardCrimeRecord[]): Promise<number> {
    let totalUpserted = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const chunk = records.slice(i, i + BATCH_SIZE);
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        for (const record of chunk) {
          await client.query(UPSERT_SQL, recordToParams(record));
        }
        await client.query('COMMIT');
        totalUpserted += chunk.length;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    return totalUpserted;
  }

  /**
   * Get count of records, optionally filtered by city.
   */
  async count(city?: string): Promise<number> {
    const query = city
      ? { text: 'SELECT COUNT(*) FROM crime_incidents WHERE city = $1', values: [city] }
      : { text: 'SELECT COUNT(*) FROM crime_incidents' };
    const result = await this.pool.query(query);
    return Number(result.rows[0].count);
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
  }
}

export function getDbConfig(): DbConfig {
  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'crime_exposure',
    user: process.env.DB_USER ?? 'crime',
    password: process.env.DB_PASSWORD ?? 'crime_dev',
  };
}
