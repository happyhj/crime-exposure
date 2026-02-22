import type { StandardCrimeRecord, City } from '../types.js';

export interface SyncOptions {
  /** Start date (inclusive), ISO format YYYY-MM-DD */
  from: string;
  /** End date (inclusive), ISO format YYYY-MM-DD */
  to: string;
}

/**
 * Interface that every city adapter must implement.
 * Each adapter fetches raw data from a city's Socrata API,
 * transforms it to StandardCrimeRecord, and handles sentinel detection.
 */
export interface CityAdapter {
  /** City identifier */
  readonly city: City;

  /**
   * Fetch and transform records for a date range.
   * Yields batches of StandardCrimeRecords.
   */
  fetchAndTransform(options: SyncOptions): AsyncGenerator<StandardCrimeRecord[], void, undefined>;
}
