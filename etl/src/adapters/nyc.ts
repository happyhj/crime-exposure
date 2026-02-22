import type { CityAdapter, SyncOptions } from './base-adapter.js';
import type { StandardCrimeRecord, NibrsCategory } from '../types.js';
import { SocrataClient } from './socrata-client.js';
import nycKyToNibrs from '../mappings/nyc-ky-to-nibrs.json' with { type: 'json' };

const NYC_DOMAIN = 'data.cityofnewyork.us';
const NYC_HISTORIC_ID = 'qgea-i56i';  // Historic: ~2006-2024
const NYC_YTD_ID = '5uac-w243';       // Current YTD: 2025+

/** Raw record shape from NYC Socrata API */
export interface NYCRawRecord {
  cmplnt_num: string;
  cmplnt_fr_dt?: string;
  cmplnt_fr_tm?: string;
  ky_cd?: string;
  ofns_desc?: string;
  law_cat_cd?: string;
  latitude?: string;
  longitude?: string;
  addr_pct_cd?: string;
  boro_nm?: string;
  patrol_boro?: string;
  [key: string]: unknown;
}

type NibrsMapping = Record<string, { nibrs_code: string; category: NibrsCategory }>;
const mapping = nycKyToNibrs as NibrsMapping;

/**
 * Map NYC ky_cd to NIBRS code + category.
 */
export function mapKyToNibrs(kyCd: string): { code: string; category: NibrsCategory } {
  const entry = mapping[kyCd];
  if (entry) return { code: entry.nibrs_code, category: entry.category };
  return { code: kyCd, category: 'Other' };
}

/**
 * Detect if NYC coordinates are missing.
 */
export function isCoordMissing(lat?: string, lon?: string): boolean {
  if (!lat || !lon) return true;
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  return isNaN(latNum) || isNaN(lonNum);
}

/**
 * Parse NYC cmplnt_fr_dt (ISO 8601) to date string.
 */
export function parseNYCDate(dateStr: string): string {
  return dateStr.slice(0, 10);
}

/**
 * Parse NYC cmplnt_fr_tm ("HH:MM:SS") to hour number.
 */
export function parseNYCTime(timeStr?: string): number | null {
  if (!timeStr) return null;
  const h = parseInt(timeStr.substring(0, 2), 10);
  if (isNaN(h) || h < 0 || h > 23) return null;
  return h;
}

/**
 * Transform a raw NYC record to StandardCrimeRecord.
 */
export function transformNYCRecord(raw: NYCRawRecord): StandardCrimeRecord | null {
  if (!raw.ky_cd) return null;

  const incidentId = Number(raw.cmplnt_num);
  if (!Number.isFinite(incidentId)) return null;

  const { code: nibrsCode, category: nibrsCategory } = mapKyToNibrs(raw.ky_cd);
  const date = raw.cmplnt_fr_dt ? parseNYCDate(raw.cmplnt_fr_dt) : null;
  if (!date) return null;

  const hour = parseNYCTime(raw.cmplnt_fr_tm);
  const coordsMissing = isCoordMissing(raw.latitude, raw.longitude);

  return {
    incident_id: incidentId,
    city: 'nyc',
    occurred_date: date,
    occurred_hour: hour,
    nibrs_code: nibrsCode,
    nibrs_category: nibrsCategory,
    latitude: coordsMissing ? null : parseFloat(raw.latitude!),
    longitude: coordsMissing ? null : parseFloat(raw.longitude!),
    district: raw.addr_pct_cd ?? null,
    neighborhood: raw.boro_nm ?? null,
    precinct: raw.patrol_boro ?? null,
    coord_precision: coordsMissing ? 'beat' : 'block',
  };
}

export class NYCAdapter implements CityAdapter {
  readonly city = 'nyc' as const;
  private readonly historicClient: SocrataClient;
  private readonly ytdClient: SocrataClient;

  constructor(appToken?: string) {
    this.historicClient = new SocrataClient({
      domain: NYC_DOMAIN,
      datasetId: NYC_HISTORIC_ID,
      appToken,
    });
    this.ytdClient = new SocrataClient({
      domain: NYC_DOMAIN,
      datasetId: NYC_YTD_ID,
      appToken,
    });
  }

  async *fetchAndTransform(options: SyncOptions): AsyncGenerator<StandardCrimeRecord[], void, undefined> {
    const where = `cmplnt_fr_dt >= '${options.from}T00:00:00' AND cmplnt_fr_dt <= '${options.to}T23:59:59'`;

    // Historic dataset covers up to 2024
    for await (const page of this.historicClient.fetchAll<NYCRawRecord>({
      where,
      order: 'cmplnt_num',
    })) {
      const records: StandardCrimeRecord[] = [];
      for (const raw of page) {
        const record = transformNYCRecord(raw);
        if (record) records.push(record);
      }
      if (records.length > 0) yield records;
    }

    // YTD dataset covers 2025+
    for await (const page of this.ytdClient.fetchAll<NYCRawRecord>({
      where,
      order: 'cmplnt_num',
    })) {
      const records: StandardCrimeRecord[] = [];
      for (const raw of page) {
        const record = transformNYCRecord(raw);
        if (record) records.push(record);
      }
      if (records.length > 0) yield records;
    }
  }
}
