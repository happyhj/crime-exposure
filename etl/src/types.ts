/** NIBRS crime category */
export type NibrsCategory = 'Violent' | 'Property' | 'Society' | 'Other';

/** Coordinate precision level */
export type CoordPrecision = 'block' | 'beat';

/** Supported cities */
export type City = 'seattle' | 'chicago' | 'la' | 'dallas' | 'nyc';

/**
 * Standard crime record (11-column schema).
 * All city adapters transform raw API data into this shape.
 */
export interface StandardCrimeRecord {
  incident_id: number;
  city: City;
  occurred_date: string;       // YYYY-MM-DD
  occurred_hour: number | null; // 0-23
  nibrs_code: string;
  nibrs_category: NibrsCategory;
  latitude: number | null;
  longitude: number | null;
  district: string | null;
  neighborhood: string | null;
  precinct: string | null;
  coord_precision: CoordPrecision;
}
