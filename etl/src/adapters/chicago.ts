import type { CityAdapter, SyncOptions } from './base-adapter.js';
import type { StandardCrimeRecord, NibrsCategory } from '../types.js';
import { SocrataClient } from './socrata-client.js';
import fbiToNibrs from '../mappings/fbi-to-nibrs.json' with { type: 'json' };
import communityAreas from '../mappings/community-areas.json' with { type: 'json' };

const CHICAGO_DOMAIN = 'data.cityofchicago.org';
const CHICAGO_DATASET_ID = 'ijzp-q8t2';

type FbiMapping = { nibrs_code: string; nibrs_category: NibrsCategory; description: string };
const fbiMapping = fbiToNibrs as Record<string, FbiMapping>;
const areaMapping = communityAreas as Record<string, string>;

/** Raw record shape from Chicago Socrata API */
export interface ChicagoRawRecord {
  id: string;
  date: string;
  fbi_code?: string;
  primary_type?: string;
  latitude?: string;
  longitude?: string;
  beat?: string;
  district?: string;
  community_area?: string;
  [key: string]: unknown;
}

/**
 * Detect if coordinate is missing.
 * Chicago uses NULL/undefined for missing coords.
 */
export function isCoordMissing(value?: string): boolean {
  return value === null || value === undefined || value === '';
}

/**
 * Map Chicago fbi_code to NIBRS code and category.
 * Unknown codes default to 'Other'.
 */
export function mapFbiToNibrs(fbiCode: string): { code: string; category: NibrsCategory } {
  const entry = fbiMapping[fbiCode];
  if (entry) {
    return { code: entry.nibrs_code, category: entry.nibrs_category };
  }
  return { code: fbiCode, category: 'Other' };
}

/**
 * Lookup community area name from number.
 */
export function lookupCommunityArea(areaNum?: string): string | null {
  if (!areaNum) return null;
  return areaMapping[areaNum] ?? null;
}

/**
 * Parse Chicago date (ISO 8601 from Socrata JSON API).
 */
export function parseChicagoDate(dateStr: string): { date: string; hour: number | null } {
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
 * Transform a raw Chicago record to StandardCrimeRecord.
 */
export function transformChicagoRecord(raw: ChicagoRawRecord): StandardCrimeRecord | null {
  if (!raw.fbi_code) return null;

  const { date, hour } = parseChicagoDate(raw.date);
  const { code: nibrsCode, category: nibrsCategory } = mapFbiToNibrs(raw.fbi_code);

  const latMissing = isCoordMissing(raw.latitude);
  const lonMissing = isCoordMissing(raw.longitude);
  const coordsMissing = latMissing || lonMissing;

  return {
    incident_id: Number(raw.id),
    city: 'chicago',
    occurred_date: date,
    occurred_hour: hour,
    nibrs_code: nibrsCode,
    nibrs_category: nibrsCategory,
    latitude: coordsMissing ? null : Number(raw.latitude),
    longitude: coordsMissing ? null : Number(raw.longitude),
    district: raw.beat ?? null,
    neighborhood: lookupCommunityArea(raw.community_area),
    precinct: raw.district ?? null,
    coord_precision: coordsMissing ? 'beat' : 'block',
  };
}

export class ChicagoAdapter implements CityAdapter {
  readonly city = 'chicago' as const;
  private readonly client: SocrataClient;

  constructor(appToken?: string) {
    this.client = new SocrataClient({
      domain: CHICAGO_DOMAIN,
      datasetId: CHICAGO_DATASET_ID,
      appToken,
    });
  }

  async *fetchAndTransform(options: SyncOptions): AsyncGenerator<StandardCrimeRecord[], void, undefined> {
    const where = `date >= '${options.from}T00:00:00' AND date <= '${options.to}T23:59:59'`;

    for await (const page of this.client.fetchAll<ChicagoRawRecord>({
      where,
      order: 'id',
    })) {
      const records: StandardCrimeRecord[] = [];
      for (const raw of page) {
        const record = transformChicagoRecord(raw);
        if (record) records.push(record);
      }
      if (records.length > 0) yield records;
    }
  }
}
