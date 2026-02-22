import type { CityAdapter, SyncOptions } from './base-adapter.js';
import type { StandardCrimeRecord } from '../types.js';
import { classifyNibrsCode } from '../nibrs.js';
import { SocrataClient } from './socrata-client.js';

const SEATTLE_DOMAIN = 'data.seattle.gov';
const SEATTLE_DATASET_ID = 'tazs-3rd5';

/** Raw record shape from Seattle Socrata API */
export interface SeattleRawRecord {
  offense_id: string;
  offense_date: string;
  nibrs_offense_code?: string;
  nibrs_crime_against_category?: string;
  latitude?: string;
  longitude?: string;
  beat?: string;
  precinct?: string;
  neighborhood?: string;
  [key: string]: unknown;
}

/**
 * Detect if coordinate is a sentinel (missing) value.
 * Seattle uses: REDACTED, -1.0, -, or simply missing.
 */
export function isCoordMissing(value?: string): boolean {
  if (!value) return true;
  const v = value.trim();
  return v === '' || v === 'REDACTED' || v === '-1.0' || v === '-';
}

/**
 * Parse Seattle's ISO 8601 datetime to date + hour.
 */
export function parseSeattleDate(dateStr: string): { date: string; hour: number | null } {
  // Format: "2024-03-15T14:30:00.000"
  const dt = new Date(dateStr);
  if (isNaN(dt.getTime())) {
    return { date: dateStr.slice(0, 10), hour: null };
  }
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return {
    date: `${year}-${month}-${day}`,
    hour: dt.getHours(),
  };
}

/**
 * Transform a raw Seattle record to StandardCrimeRecord.
 */
export function transformSeattleRecord(raw: SeattleRawRecord): StandardCrimeRecord | null {
  const nibrsCode = raw.nibrs_offense_code;
  if (!nibrsCode) return null; // Skip records without NIBRS code

  const { date, hour } = parseSeattleDate(raw.offense_date);

  const latMissing = isCoordMissing(raw.latitude);
  const lonMissing = isCoordMissing(raw.longitude);
  const coordsMissing = latMissing || lonMissing;

  return {
    incident_id: Number(raw.offense_id),
    city: 'seattle',
    occurred_date: date,
    occurred_hour: hour,
    nibrs_code: nibrsCode,
    nibrs_category: classifyNibrsCode(nibrsCode),
    latitude: coordsMissing ? null : Number(raw.latitude),
    longitude: coordsMissing ? null : Number(raw.longitude),
    district: raw.beat ?? null,
    neighborhood: raw.neighborhood && raw.neighborhood !== '-' ? raw.neighborhood : null,
    precinct: raw.precinct ?? null,
    coord_precision: coordsMissing ? 'beat' : 'block',
  };
}

export class SeattleAdapter implements CityAdapter {
  readonly city = 'seattle' as const;
  private readonly client: SocrataClient;

  constructor(appToken?: string) {
    this.client = new SocrataClient({
      domain: SEATTLE_DOMAIN,
      datasetId: SEATTLE_DATASET_ID,
      appToken,
    });
  }

  async *fetchAndTransform(options: SyncOptions): AsyncGenerator<StandardCrimeRecord[], void, undefined> {
    const where = `offense_date >= '${options.from}T00:00:00' AND offense_date <= '${options.to}T23:59:59'`;

    for await (const page of this.client.fetchAll<SeattleRawRecord>({
      where,
      order: 'offense_id',
    })) {
      const records: StandardCrimeRecord[] = [];
      for (const raw of page) {
        const record = transformSeattleRecord(raw);
        if (record) records.push(record);
      }
      if (records.length > 0) yield records;
    }
  }
}
