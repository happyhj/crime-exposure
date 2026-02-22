import type { CityAdapter } from './adapters/base-adapter.js';
import type { City } from './types.js';
import { SeattleAdapter } from './adapters/seattle.js';
import { ChicagoAdapter } from './adapters/chicago.js';
import { LAAdapter } from './adapters/la.js';
import { DallasAdapter } from './adapters/dallas.js';
import { NYCAdapter } from './adapters/nyc.js';
import { CrimeDb, getDbConfig } from './db.js';

const SUPPORTED_CITIES: City[] = ['seattle', 'chicago', 'la', 'dallas', 'nyc'];
const LOOKBACK_DAYS = 10;

function getDateRange(mode: 'full' | 'incremental'): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);

  if (mode === 'full') {
    return { from: '2023-01-01', to };
  }

  const lookback = new Date(now);
  lookback.setDate(lookback.getDate() - LOOKBACK_DAYS);
  return { from: lookback.toISOString().slice(0, 10), to };
}

function createAdapter(city: City): CityAdapter {
  const appToken = process.env.SOCRATA_APP_TOKEN;
  switch (city) {
    case 'seattle':
      return new SeattleAdapter(appToken);
    case 'chicago':
      return new ChicagoAdapter(appToken);
    case 'la':
      return new LAAdapter(appToken);
    case 'dallas':
      return new DallasAdapter(appToken);
    case 'nyc':
      return new NYCAdapter(appToken);
    default:
      throw new Error(`Adapter not yet implemented for city: ${city}`);
  }
}

interface SyncResult {
  city: City;
  recordsLoaded: number;
  durationMs: number;
  errors: string[];
}

async function syncCity(city: City, mode: 'full' | 'incremental', db: CrimeDb): Promise<SyncResult> {
  const start = Date.now();
  const { from, to } = getDateRange(mode);
  const errors: string[] = [];
  let totalRecords = 0;

  console.log(`[${city}] Starting ${mode} sync (${from} → ${to})...`);

  try {
    const adapter = createAdapter(city);
    for await (const batch of adapter.fetchAndTransform({ from, to })) {
      const count = await db.upsertBatch(batch);
      totalRecords += count;
      console.log(`  [${city}] Loaded ${totalRecords} records...`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    console.error(`  [${city}] Error: ${msg}`);
  }

  return {
    city,
    recordsLoaded: totalRecords,
    durationMs: Date.now() - start,
    errors,
  };
}

function printSummary(results: SyncResult[]) {
  console.log('\n=== Sync Summary ===');
  for (const r of results) {
    const status = r.errors.length > 0 ? 'ERROR' : 'OK';
    const duration = (r.durationMs / 1000).toFixed(1);
    console.log(`  ${r.city}: ${r.recordsLoaded} records in ${duration}s [${status}]`);
    for (const err of r.errors) {
      console.log(`    → ${err}`);
    }
  }
  const total = results.reduce((sum, r) => sum + r.recordsLoaded, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  console.log(`Total: ${total} records, ${totalErrors} errors`);
}

export async function runSync(city: string, mode: 'full' | 'incremental') {
  const db = new CrimeDb(getDbConfig());
  const results: SyncResult[] = [];

  try {
    const cities: City[] = city === 'all'
      ? SUPPORTED_CITIES
      : [city as City];

    for (const c of cities) {
      if (!SUPPORTED_CITIES.includes(c)) {
        console.error(`Unknown city: ${c}. Supported: ${SUPPORTED_CITIES.join(', ')}`);
        continue;
      }
      const result = await syncCity(c, mode, db);
      results.push(result);
    }

    printSummary(results);
  } finally {
    await db.disconnect();
  }

  return results;
}

// CLI entry point
const args = process.argv.slice(2);
const cityArg = args.find(a => a.startsWith('--city='))?.split('=')[1] ?? 'all';
const modeArg = args.find(a => a.startsWith('--mode='))?.split('=')[1] as 'full' | 'incremental' ?? 'incremental';

if (args.length > 0) {
  runSync(cityArg, modeArg).catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
