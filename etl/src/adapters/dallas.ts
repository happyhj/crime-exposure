import type { CityAdapter, SyncOptions } from './base-adapter.js';
import type { StandardCrimeRecord } from '../types.js';
import { classifyNibrsCode } from '../nibrs.js';
import { SocrataClient } from './socrata-client.js';

const DALLAS_DOMAIN = 'www.dallasopendata.com';
const DALLAS_DATASET_ID = 'qv6i-rri7';

/** Raw record shape from Dallas Socrata API */
export interface DallasRawRecord {
  incidentnum: string;
  servnumid?: string;
  date1: string;
  time1?: string;
  nibrs_code?: string;
  nibrs_crime?: string;
  nibrs_type?: string;
  geocoded_column?: {
    latitude?: string;
    longitude?: string;
    human_address?: string;
  };
  beat?: string;
  division?: string;
  sector?: string;
  taag?: string;
  [key: string]: unknown;
}

/**
 * Detect if Dallas coordinates are missing.
 * Dallas coordinates are nested in geocoded_column.
 */
export function isCoordMissing(record: DallasRawRecord): boolean {
  const geo = record.geocoded_column;
  if (!geo) return true;
  if (!geo.latitude || !geo.longitude) return true;
  const lat = parseFloat(geo.latitude);
  const lon = parseFloat(geo.longitude);
  return isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0);
}

/**
 * Parse Dallas date1 ("YYYY-MM-DD HH:MM:SS.0000000") to date string.
 */
export function parseDallasDate(dateStr: string): string {
  return dateStr.slice(0, 10);
}

/**
 * Parse Dallas time1 ("HH:MM") to hour number.
 */
export function parseDallasTime(timeStr?: string): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length < 1) return null;
  const h = parseInt(parts[0], 10);
  if (isNaN(h) || h < 0 || h > 23) return null;
  return h;
}

/**
 * Transform a raw Dallas record to StandardCrimeRecord.
 */
export function transformDallasRecord(raw: DallasRawRecord): StandardCrimeRecord | null {
  const nibrsCode = raw.nibrs_code;
  if (!nibrsCode) return null;

  const date = parseDallasDate(raw.date1);
  const hour = parseDallasTime(raw.time1);
  const coordsMissing = isCoordMissing(raw);

  // Use servnumid as unique ID (format: "143577-2020-01")
  // Convert to number by removing dashes
  const idStr = (raw.servnumid ?? raw.incidentnum).replace(/-/g, '');
  const incidentId = parseInt(idStr, 10);

  return {
    incident_id: isNaN(incidentId) ? 0 : incidentId,
    city: 'dallas',
    occurred_date: date,
    occurred_hour: hour,
    nibrs_code: nibrsCode,
    nibrs_category: classifyNibrsCode(nibrsCode),
    latitude: coordsMissing ? null : parseFloat(raw.geocoded_column!.latitude!),
    longitude: coordsMissing ? null : parseFloat(raw.geocoded_column!.longitude!),
    district: raw.beat ?? null,
    neighborhood: raw.taag ?? null,
    precinct: raw.division ?? null,
    coord_precision: coordsMissing ? 'beat' : 'block',
  };
}

export class DallasAdapter implements CityAdapter {
  readonly city = 'dallas' as const;
  private readonly client: SocrataClient;

  constructor(appToken?: string) {
    this.client = new SocrataClient({
      domain: DALLAS_DOMAIN,
      datasetId: DALLAS_DATASET_ID,
      appToken,
    });
  }

  async *fetchAndTransform(options: SyncOptions): AsyncGenerator<StandardCrimeRecord[], void, undefined> {
    const where = `date1 >= '${options.from}T00:00:00' AND date1 <= '${options.to}T23:59:59'`;

    for await (const page of this.client.fetchAll<DallasRawRecord>({
      where,
      order: 'incidentnum',
    })) {
      const records: StandardCrimeRecord[] = [];
      for (const raw of page) {
        const record = transformDallasRecord(raw);
        if (record) records.push(record);
      }
      if (records.length > 0) yield records;
    }
  }
}
