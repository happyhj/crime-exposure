/**
 * Crime Exposure Score algorithm.
 *
 * Pure functions — no side effects, easily testable.
 *
 * Score = Σ (crime_weight × time_relevance × distance_decay)
 * Normalized to 0–100, then mapped to A/B/C/D/F grade.
 */

// ---------- Types ----------

export interface CrimeRecord {
  nibrs_code: string;
  nibrs_category: string;
  occurred_hour: number | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ScoreInput {
  /** Crimes near the candidate home (radius ~500m) */
  homeCrimes: CrimeRecord[];
  /** Crimes along the commute corridor (buffer ~200m) */
  commuteCrimes: CrimeRecord[];
  /** Crimes near the workplace (radius ~500m) */
  workCrimes: CrimeRecord[];
  /** Hour the user leaves home (0-23) */
  commuteStart: number;
  /** Hour the user leaves work (0-23) */
  commuteEnd: number;
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface ExposureResult {
  /** Overall score 0–100 (higher = more dangerous) */
  total: number;
  /** Grade A–F */
  grade: Grade;
  /** Sub-scores */
  home: number;
  commute: number;
  work: number;
}

// ---------- Crime weight by context ----------

type Context = 'home' | 'commute' | 'work';

const CRIME_WEIGHTS: Record<string, Record<Context, number>> = {
  // Violent crimes
  '09A': { home: 0.8, commute: 1.0, work: 0.5 }, // Murder
  '09B': { home: 0.8, commute: 1.0, work: 0.5 }, // Negligent Manslaughter
  '13A': { home: 0.8, commute: 1.0, work: 0.5 }, // Aggravated Assault
  '13B': { home: 0.6, commute: 0.8, work: 0.4 }, // Simple Assault
  '120': { home: 0.6, commute: 1.0, work: 0.4 }, // Robbery
  '11A': { home: 0.7, commute: 0.9, work: 0.5 }, // Forcible Rape
  '11B': { home: 0.7, commute: 0.9, work: 0.5 }, // Forcible Sodomy
  '11C': { home: 0.7, commute: 0.9, work: 0.5 }, // Sexual Assault
  '11D': { home: 0.7, commute: 0.9, work: 0.5 }, // Fondling
  '36A': { home: 0.7, commute: 0.9, work: 0.5 }, // Intimidation (stalking)
  '36B': { home: 0.7, commute: 0.9, work: 0.5 }, // Stalking
  '64A': { home: 0.5, commute: 0.7, work: 0.4 }, // Human Trafficking - Commercial Sex
  '64B': { home: 0.5, commute: 0.7, work: 0.4 }, // Human Trafficking - Involuntary Servitude

  // Property crimes
  '220': { home: 1.0, commute: 0.2, work: 0.3 }, // Burglary
  '23A': { home: 0.7, commute: 0.5, work: 0.6 }, // Pocket-picking
  '23B': { home: 0.7, commute: 0.5, work: 0.6 }, // Purse-snatching
  '23C': { home: 0.7, commute: 0.5, work: 0.6 }, // Shoplifting
  '23D': { home: 0.7, commute: 0.5, work: 0.6 }, // Theft From Building
  '23E': { home: 0.7, commute: 0.5, work: 0.6 }, // Theft From Coin Machine
  '23F': { home: 0.7, commute: 0.5, work: 0.6 }, // Theft From Motor Vehicle
  '23G': { home: 0.7, commute: 0.5, work: 0.6 }, // Theft of Motor Vehicle Parts
  '23H': { home: 0.7, commute: 0.5, work: 0.6 }, // All Other Larceny
  '240': { home: 0.8, commute: 0.1, work: 0.7 }, // Motor Vehicle Theft
  '200': { home: 0.6, commute: 0.2, work: 0.3 }, // Arson
  '250': { home: 0.5, commute: 0.3, work: 0.3 }, // Counterfeiting/Forgery
  '270': { home: 0.3, commute: 0.1, work: 0.2 }, // Embezzlement
  '280': { home: 0.4, commute: 0.2, work: 0.3 }, // Stolen Property
  '290': { home: 0.5, commute: 0.2, work: 0.2 }, // Destruction/Vandalism

  // Society crimes
  '35A': { home: 0.4, commute: 0.6, work: 0.3 }, // Drug/Narcotics Violations
  '35B': { home: 0.3, commute: 0.4, work: 0.2 }, // Drug Equipment Violations
  '39A': { home: 0.2, commute: 0.3, work: 0.2 }, // Betting/Wagering
  '39B': { home: 0.2, commute: 0.3, work: 0.2 }, // Operating/Promoting Gambling
  '40A': { home: 0.3, commute: 0.5, work: 0.3 }, // Prostitution
  '40B': { home: 0.3, commute: 0.5, work: 0.3 }, // Assisting Prostitution
  '520': { home: 0.3, commute: 0.4, work: 0.2 }, // Weapon Law Violations
  '90A': { home: 0.3, commute: 0.3, work: 0.2 }, // Disorderly Conduct
  '90C': { home: 0.3, commute: 0.4, work: 0.2 }, // Disorderly Conduct
  '90D': { home: 0.2, commute: 0.3, work: 0.2 }, // DUI
  '90Z': { home: 0.2, commute: 0.2, work: 0.1 }, // All Other Offenses
};

const DEFAULT_WEIGHT: Record<Context, number> = { home: 0.3, commute: 0.3, work: 0.2 };

// ---------- Core functions ----------

/**
 * Time relevance: how close the crime hour is to the user's relevant hour.
 * Returns 1.0 for exact match, linearly decays to 0 at ±4 hours.
 */
export function timeRelevance(crimeHour: number | null, referenceHour: number): number {
  if (crimeHour == null) return 0.5; // Unknown hour → moderate relevance
  const diff = Math.abs(crimeHour - referenceHour);
  // Handle wrap-around (e.g. crime at 23, reference at 1 → diff = 2)
  const circDiff = Math.min(diff, 24 - diff);
  return Math.max(0, 1 - circDiff / 4);
}

/**
 * Distance decay: crimes closer to the point of interest are more relevant.
 * ≤200m: 1.0, 200–500m: linear decay, >500m: 0.
 *
 * For corridor crimes this is not used (all crimes are already within buffer).
 * We assign corridor crimes a flat 1.0 since they're pre-filtered by buffer.
 */
export function distanceDecay(distMeters: number): number {
  if (distMeters <= 200) return 1.0;
  if (distMeters <= 500) return 1.0 - (distMeters - 200) / 300;
  return 0;
}

/**
 * Get the crime weight for a specific crime in a specific context.
 */
export function getCrimeWeight(nibrsCode: string, context: Context): number {
  const weights = CRIME_WEIGHTS[nibrsCode];
  if (weights) return weights[context];
  return DEFAULT_WEIGHT[context];
}

/**
 * Compute a raw sub-score for a set of crimes in a context.
 * This is the sum of (weight × time_relevance).
 * Distance is not applied here because crimes are already pre-filtered by radius/buffer.
 */
function computeSubScore(
  crimes: CrimeRecord[],
  context: Context,
  referenceHour: number,
): number {
  let score = 0;
  for (const crime of crimes) {
    const w = getCrimeWeight(crime.nibrs_code, context);
    const t = timeRelevance(crime.occurred_hour, referenceHour);
    score += w * t;
  }
  return score;
}

/**
 * Normalize a raw score to 0–100 using a logarithmic scale.
 * This prevents extreme crime counts from dominating.
 *
 * The calibration constant controls sensitivity:
 * - At rawScore = calibration → normalized = 50
 * - At rawScore = 0 → normalized = 0
 */
function normalize(rawScore: number, calibration: number): number {
  if (rawScore <= 0) return 0;
  // log1p-based normalization
  const normalized = (Math.log1p(rawScore) / Math.log1p(calibration)) * 50;
  return Math.min(100, Math.round(normalized * 10) / 10);
}

/**
 * Map a 0–100 score to a letter grade.
 */
export function scoreToGrade(score: number): Grade {
  if (score <= 20) return 'A';
  if (score <= 40) return 'B';
  if (score <= 60) return 'C';
  if (score <= 80) return 'D';
  return 'F';
}

// Calibration constants for each sub-score
// These determine what raw score maps to 50/100 on the normalized scale
const CALIBRATION_HOME = 100;    // 100 weighted crime events → score 50
const CALIBRATION_COMMUTE = 50;  // commutes have fewer crimes in buffer
const CALIBRATION_WORK = 80;

/**
 * Compute the full Crime Exposure Score for a candidate home.
 */
export function computeExposureScore(input: ScoreInput): ExposureResult {
  // Reference hours for time relevance
  // Home: mid-point of absence (when burglary matters most)
  const absenceMidpoint = input.commuteStart <= input.commuteEnd
    ? Math.floor((input.commuteStart + input.commuteEnd) / 2)
    : Math.floor(((input.commuteStart + input.commuteEnd + 24) / 2) % 24);

  // Commute: average of start and end (when you're on the street)
  const commuteHour = input.commuteStart;

  // Work: mid-point of work hours
  const workHour = absenceMidpoint;

  const homeRaw = computeSubScore(input.homeCrimes, 'home', absenceMidpoint);
  const commuteRaw = computeSubScore(input.commuteCrimes, 'commute', commuteHour);
  const workRaw = computeSubScore(input.workCrimes, 'work', workHour);

  const home = normalize(homeRaw, CALIBRATION_HOME);
  const commute = normalize(commuteRaw, CALIBRATION_COMMUTE);
  const work = normalize(workRaw, CALIBRATION_WORK);

  // Weighted average: commute safety weighted highest (most personal risk)
  const total = Math.round((home * 0.35 + commute * 0.40 + work * 0.25) * 10) / 10;
  const grade = scoreToGrade(total);

  return { total, grade, home, commute, work };
}
