import type { CityAdapter, SyncOptions } from './base-adapter.js';
import type { StandardCrimeRecord, NibrsCategory } from '../types.js';
import { SocrataClient } from './socrata-client.js';
import laCrmToNibrs from '../mappings/la-crm-to-nibrs.json' with { type: 'json' };

const LA_DOMAIN = 'data.lacity.org';
const LA_DATASET_ID = '2nrs-mtv8';

/** Raw record shape from LA Socrata API */
export interface LARawRecord {
  dr_no: string;
  date_occ: string;
  time_occ?: string;
  crm_cd?: string;
  crm_cd_desc?: string;
  lat?: string;
  lon?: string;
  area?: string;
  area_name?: string;
  rpt_dist_no?: string;
  [key: string]: unknown;
}

type NibrsMapping = Record<string, { nibrs_code: string; category: NibrsCategory }>;
const mapping = laCrmToNibrs as NibrsMapping;

/**
 * Map LA crm_cd to NIBRS code + category.
 */
export function mapCrmToNibrs(crmCd: string): { code: string; category: NibrsCategory } {
  const entry = mapping[crmCd];
  if (entry) return { code: entry.nibrs_code, category: entry.category };
  return { code: crmCd, category: 'Other' };
}

/**
 * Detect if LA coordinates are sentinel (missing) values.
 * LA uses (0.0, 0.0) or missing values.
 */
export function isCoordMissing(lat?: string, lon?: string): boolean {
  if (!lat || !lon) return true;
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  if (isNaN(latNum) || isNaN(lonNum)) return true;
  return latNum === 0 && lonNum === 0;
}

/**
 * Parse LA date_occ (ISO 8601) + time_occ (4-digit HHMM) to date + hour.
 */
export function parseLADateTime(dateStr: string, timeStr?: string): { date: string; hour: number | null } {
  // date_occ: "2024-03-15T00:00:00.000"
  const date = dateStr.slice(0, 10);

  // time_occ: "0845" → hour 8, "2300" → hour 23
  let hour: number | null = null;
  if (timeStr && timeStr.length >= 2) {
    const h = parseInt(timeStr.substring(0, 2), 10);
    if (!isNaN(h) && h >= 0 && h <= 23) {
      hour = h;
    }
  }

  return { date, hour };
}

/**
 * Transform a raw LA record to StandardCrimeRecord.
 */
export function transformLARecord(raw: LARawRecord): StandardCrimeRecord | null {
  if (!raw.crm_cd) return null;

  const { code: nibrsCode, category: nibrsCategory } = mapCrmToNibrs(raw.crm_cd);
  const { date, hour } = parseLADateTime(raw.date_occ, raw.time_occ);

  const coordsMissing = isCoordMissing(raw.lat, raw.lon);

  return {
    incident_id: Number(raw.dr_no),
    city: 'la',
    occurred_date: date,
    occurred_hour: hour,
    nibrs_code: nibrsCode,
    nibrs_category: nibrsCategory,
    latitude: coordsMissing ? null : parseFloat(raw.lat!),
    longitude: coordsMissing ? null : parseFloat(raw.lon!),
    district: raw.rpt_dist_no ?? null,
    neighborhood: raw.area_name ?? null,
    precinct: raw.area ?? null,
    coord_precision: coordsMissing ? 'beat' : 'block',
  };
}

export class LAAdapter implements CityAdapter {
  readonly city = 'la' as const;
  private readonly client: SocrataClient;

  constructor(appToken?: string) {
    this.client = new SocrataClient({
      domain: LA_DOMAIN,
      datasetId: LA_DATASET_ID,
      appToken,
    });
  }

  async *fetchAndTransform(options: SyncOptions): AsyncGenerator<StandardCrimeRecord[], void, undefined> {
    const where = `date_occ >= '${options.from}T00:00:00' AND date_occ <= '${options.to}T23:59:59'`;

    for await (const page of this.client.fetchAll<LARawRecord>({
      where,
      order: 'dr_no',
    })) {
      const records: StandardCrimeRecord[] = [];
      for (const raw of page) {
        const record = transformLARecord(raw);
        if (record) records.push(record);
      }
      if (records.length > 0) yield records;
    }
  }
}
