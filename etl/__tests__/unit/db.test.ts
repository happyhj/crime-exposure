import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StandardCrimeRecord } from '../../src/types.js';

// Mock pg module
const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn().mockResolvedValue({
  query: mockQuery,
  release: mockRelease,
});
const mockEnd = vi.fn();

vi.mock('pg', () => {
  return {
    default: {
      Pool: vi.fn().mockImplementation(() => ({
        connect: mockConnect,
        query: vi.fn().mockResolvedValue({ rows: [{ count: '42' }] }),
        end: mockEnd,
      })),
    },
  };
});

import { CrimeDb } from '../../src/db.js';

function makeRecord(overrides: Partial<StandardCrimeRecord> = {}): StandardCrimeRecord {
  return {
    incident_id: 1,
    city: 'seattle',
    occurred_date: '2024-01-15',
    occurred_hour: 14,
    nibrs_code: '23H',
    nibrs_category: 'Property',
    latitude: 47.606,
    longitude: -122.332,
    district: 'F3',
    neighborhood: 'HIGHLAND PARK',
    precinct: 'Southwest',
    coord_precision: 'block',
    ...overrides,
  };
}

describe('CrimeDb', () => {
  let db: CrimeDb;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
    db = new CrimeDb({
      host: 'localhost',
      port: 5432,
      database: 'crime_test',
      user: 'test',
      password: 'test',
    });
  });

  describe('upsertBatch', () => {
    it('wraps inserts in a transaction', async () => {
      const records = [makeRecord()];
      await db.upsertBatch(records);

      const calls = mockQuery.mock.calls.map((c) => c[0]);
      expect(calls[0]).toBe('BEGIN');
      expect(calls[calls.length - 1]).toBe('COMMIT');
    });

    it('passes all 12 fields as parameters', async () => {
      const record = makeRecord({
        incident_id: 42,
        city: 'seattle',
        occurred_date: '2024-03-15',
        occurred_hour: 14,
      });
      await db.upsertBatch([record]);

      // The INSERT call is the 2nd call (after BEGIN)
      const insertCall = mockQuery.mock.calls[1];
      const params = insertCall[1];
      expect(params).toHaveLength(12);
      expect(params[0]).toBe(42);
      expect(params[1]).toBe('seattle');
      expect(params[2]).toBe('2024-03-15');
      expect(params[3]).toBe(14);
    });

    it('returns count of upserted records', async () => {
      const records = [makeRecord({ incident_id: 1 }), makeRecord({ incident_id: 2 })];
      const count = await db.upsertBatch(records);
      expect(count).toBe(2);
    });

    it('rolls back on error', async () => {
      mockQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('DB error')); // INSERT fails

      await expect(db.upsertBatch([makeRecord()])).rejects.toThrow('DB error');

      const calls = mockQuery.mock.calls.map((c) => c[0]);
      expect(calls).toContain('ROLLBACK');
    });

    it('releases connection after success', async () => {
      await db.upsertBatch([makeRecord()]);
      expect(mockRelease).toHaveBeenCalled();
    });

    it('releases connection after error', async () => {
      mockQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('fail'));

      await expect(db.upsertBatch([makeRecord()])).rejects.toThrow();
      expect(mockRelease).toHaveBeenCalled();
    });

    it('handles null fields correctly', async () => {
      const record = makeRecord({
        occurred_hour: null,
        latitude: null,
        longitude: null,
        district: null,
        neighborhood: null,
        precinct: null,
        coord_precision: 'beat',
      });
      await db.upsertBatch([record]);

      const params = mockQuery.mock.calls[1][1];
      expect(params[3]).toBeNull(); // occurred_hour
      expect(params[6]).toBeNull(); // latitude
      expect(params[7]).toBeNull(); // longitude
    });
  });

  describe('disconnect', () => {
    it('ends the pool', async () => {
      await db.disconnect();
      expect(mockEnd).toHaveBeenCalled();
    });
  });
});
