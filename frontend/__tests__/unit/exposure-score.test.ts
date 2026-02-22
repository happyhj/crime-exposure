import { describe, it, expect } from 'vitest';
import {
  timeRelevance,
  distanceDecay,
  getCrimeWeight,
  getHouseholdMultiplier,
  scoreToGrade,
  computeExposureScore,
  type CrimeRecord,
  type ScoreInput,
} from '../../src/utils/exposure-score.js';

// ---------- timeRelevance ----------

describe('timeRelevance', () => {
  it('returns 1.0 for exact match', () => {
    expect(timeRelevance(8, 8)).toBe(1.0);
  });

  it('returns 0.5 for ±2 hours', () => {
    expect(timeRelevance(10, 8)).toBe(0.5);
    expect(timeRelevance(6, 8)).toBe(0.5);
  });

  it('returns 0 for ±4 hours or more', () => {
    expect(timeRelevance(12, 8)).toBe(0);
    expect(timeRelevance(4, 8)).toBe(0);
    expect(timeRelevance(15, 8)).toBe(0);
  });

  it('handles wrap-around (23 vs 1 → diff = 2)', () => {
    expect(timeRelevance(23, 1)).toBe(0.5);
    expect(timeRelevance(1, 23)).toBe(0.5);
  });

  it('handles wrap-around exact match (0 vs 0)', () => {
    expect(timeRelevance(0, 0)).toBe(1.0);
  });

  it('returns 0.5 for null crime hour (unknown)', () => {
    expect(timeRelevance(null, 8)).toBe(0.5);
  });
});

// ---------- distanceDecay ----------

describe('distanceDecay', () => {
  it('returns 1.0 for ≤200m', () => {
    expect(distanceDecay(0)).toBe(1.0);
    expect(distanceDecay(100)).toBe(1.0);
    expect(distanceDecay(200)).toBe(1.0);
  });

  it('linearly decays between 200m and 500m', () => {
    expect(distanceDecay(350)).toBeCloseTo(0.5);
    expect(distanceDecay(275)).toBeCloseTo(0.75);
  });

  it('returns 0 for >500m', () => {
    expect(distanceDecay(500)).toBe(0);
    expect(distanceDecay(1000)).toBe(0);
  });
});

// ---------- getCrimeWeight ----------

describe('getCrimeWeight', () => {
  it('returns correct weight for known crime', () => {
    // Murder during commute
    expect(getCrimeWeight('09A', 'commute')).toBe(1.0);
    // Burglary at home
    expect(getCrimeWeight('220', 'home')).toBe(1.0);
    // Robbery during commute
    expect(getCrimeWeight('120', 'commute')).toBe(1.0);
  });

  it('returns lower weight for less relevant context', () => {
    // Burglary during commute (low relevance)
    expect(getCrimeWeight('220', 'commute')).toBe(0.2);
    // Motor Vehicle Theft during commute (very low)
    expect(getCrimeWeight('240', 'commute')).toBe(0.1);
  });

  it('returns default weight for unknown nibrs code', () => {
    expect(getCrimeWeight('999', 'home')).toBe(0.3);
    expect(getCrimeWeight('999', 'commute')).toBe(0.3);
    expect(getCrimeWeight('999', 'work')).toBe(0.2);
  });
});

// ---------- scoreToGrade ----------

describe('scoreToGrade', () => {
  it('maps score ranges to correct grades', () => {
    expect(scoreToGrade(0)).toBe('A');
    expect(scoreToGrade(10)).toBe('A');
    expect(scoreToGrade(20)).toBe('A');
    expect(scoreToGrade(21)).toBe('B');
    expect(scoreToGrade(40)).toBe('B');
    expect(scoreToGrade(41)).toBe('C');
    expect(scoreToGrade(60)).toBe('C');
    expect(scoreToGrade(61)).toBe('D');
    expect(scoreToGrade(80)).toBe('D');
    expect(scoreToGrade(81)).toBe('F');
    expect(scoreToGrade(100)).toBe('F');
  });
});

// ---------- computeExposureScore ----------

function makeCrime(overrides: Partial<CrimeRecord> = {}): CrimeRecord {
  return {
    nibrs_code: '23H',
    nibrs_category: 'Property',
    occurred_hour: 12,
    latitude: 47.6,
    longitude: -122.3,
    ...overrides,
  };
}

function makeInput(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    homeCrimes: [],
    commuteCrimes: [],
    workCrimes: [],
    commuteStart: 8,
    commuteEnd: 18,
    ...overrides,
  };
}

describe('computeExposureScore', () => {
  it('returns score 0 and grade A when no crimes', () => {
    const result = computeExposureScore(makeInput());
    expect(result.total).toBe(0);
    expect(result.grade).toBe('A');
    expect(result.home).toBe(0);
    expect(result.commute).toBe(0);
    expect(result.work).toBe(0);
  });

  it('returns higher score with more crimes', () => {
    const fewCrimes = makeInput({
      homeCrimes: Array.from({ length: 5 }, () => makeCrime({ nibrs_code: '220', occurred_hour: 12 })),
    });
    const manyCrimes = makeInput({
      homeCrimes: Array.from({ length: 50 }, () => makeCrime({ nibrs_code: '220', occurred_hour: 12 })),
    });

    const fewResult = computeExposureScore(fewCrimes);
    const manyResult = computeExposureScore(manyCrimes);
    expect(manyResult.total).toBeGreaterThan(fewResult.total);
    expect(manyResult.home).toBeGreaterThan(fewResult.home);
  });

  it('violent crimes during commute produce high commute sub-score', () => {
    const input = makeInput({
      commuteCrimes: Array.from({ length: 30 }, () =>
        makeCrime({ nibrs_code: '09A', nibrs_category: 'Violent', occurred_hour: 8 }),
      ),
    });
    const result = computeExposureScore(input);
    expect(result.commute).toBeGreaterThan(30);
    expect(result.commute).toBeGreaterThan(result.home);
  });

  it('burglaries during absence hours produce high home sub-score', () => {
    const input = makeInput({
      commuteStart: 8,
      commuteEnd: 18,
      homeCrimes: Array.from({ length: 30 }, () =>
        makeCrime({ nibrs_code: '220', nibrs_category: 'Property', occurred_hour: 13 }), // midday = peak absence
      ),
    });
    const result = computeExposureScore(input);
    expect(result.home).toBeGreaterThan(30);
  });

  it('crimes at irrelevant hours have low impact', () => {
    // Commute crimes at 3am when user commutes at 8am
    const irrelevant = makeInput({
      commuteCrimes: Array.from({ length: 20 }, () =>
        makeCrime({ nibrs_code: '09A', occurred_hour: 3 }),
      ),
    });
    // Commute crimes at 8am (matching commute time)
    const relevant = makeInput({
      commuteCrimes: Array.from({ length: 20 }, () =>
        makeCrime({ nibrs_code: '09A', occurred_hour: 8 }),
      ),
    });

    const irrelevantResult = computeExposureScore(irrelevant);
    const relevantResult = computeExposureScore(relevant);
    expect(relevantResult.commute).toBeGreaterThan(irrelevantResult.commute);
  });

  it('total is weighted average of sub-scores', () => {
    const input = makeInput({
      homeCrimes: Array.from({ length: 50 }, () => makeCrime({ nibrs_code: '220', occurred_hour: 13 })),
      commuteCrimes: Array.from({ length: 50 }, () => makeCrime({ nibrs_code: '09A', occurred_hour: 8 })),
      workCrimes: Array.from({ length: 50 }, () => makeCrime({ nibrs_code: '23H', occurred_hour: 13 })),
    });
    const result = computeExposureScore(input);
    // Total should be between min and max of sub-scores
    const minSub = Math.min(result.home, result.commute, result.work);
    const maxSub = Math.max(result.home, result.commute, result.work);
    expect(result.total).toBeGreaterThanOrEqual(minSub);
    expect(result.total).toBeLessThanOrEqual(maxSub);
  });

  it('extreme crime density produces high score near 100', () => {
    const input = makeInput({
      homeCrimes: Array.from({ length: 500 }, () => makeCrime({ nibrs_code: '09A', occurred_hour: 13 })),
      commuteCrimes: Array.from({ length: 500 }, () => makeCrime({ nibrs_code: '09A', occurred_hour: 8 })),
      workCrimes: Array.from({ length: 500 }, () => makeCrime({ nibrs_code: '09A', occurred_hour: 13 })),
    });
    const result = computeExposureScore(input);
    expect(result.total).toBeGreaterThan(70);
    expect(result.grade).toMatch(/[DF]/);
  });

  it('returns all required fields', () => {
    const result = computeExposureScore(makeInput());
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('grade');
    expect(result).toHaveProperty('home');
    expect(result).toHaveProperty('commute');
    expect(result).toHaveProperty('work');
    expect(typeof result.total).toBe('number');
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade);
  });
});

// ---------- getHouseholdMultiplier ----------

describe('getHouseholdMultiplier', () => {
  it('solo always returns 1.0 for assault', () => {
    expect(getHouseholdMultiplier('13A', 'solo')).toBe(1.0);
  });

  it('couple reduces assault weight', () => {
    expect(getHouseholdMultiplier('13A', 'couple')).toBe(0.8);
  });

  it('family increases assault weight', () => {
    expect(getHouseholdMultiplier('13A', 'family')).toBe(1.2);
  });

  it('family increases sex offense weight to 1.5', () => {
    expect(getHouseholdMultiplier('11A', 'family')).toBe(1.5);
  });

  it('family increases drug crime weight to 1.3', () => {
    expect(getHouseholdMultiplier('35A', 'family')).toBe(1.3);
  });

  it('couple reduces robbery weight', () => {
    expect(getHouseholdMultiplier('120', 'couple')).toBe(0.7);
  });

  it('returns default multiplier for unknown code', () => {
    expect(getHouseholdMultiplier('999', 'solo')).toBe(1.0);
    expect(getHouseholdMultiplier('999', 'couple')).toBe(0.9);
    expect(getHouseholdMultiplier('999', 'family')).toBe(1.0);
  });
});

// ---------- Household integration with computeExposureScore ----------

describe('computeExposureScore with household', () => {
  it('family scores higher than solo for sex offenses', () => {
    const sexCrimes = Array.from({ length: 20 }, () =>
      makeCrime({ nibrs_code: '11A', nibrs_category: 'Violent', occurred_hour: 13 }),
    );

    const soloResult = computeExposureScore(makeInput({
      homeCrimes: sexCrimes,
      household: 'solo',
    }));
    const familyResult = computeExposureScore(makeInput({
      homeCrimes: sexCrimes,
      household: 'family',
    }));

    expect(familyResult.home).toBeGreaterThan(soloResult.home);
  });

  it('couple scores lower than solo for violent crimes', () => {
    const violentCrimes = Array.from({ length: 20 }, () =>
      makeCrime({ nibrs_code: '13A', nibrs_category: 'Violent', occurred_hour: 8 }),
    );

    const soloResult = computeExposureScore(makeInput({
      commuteCrimes: violentCrimes,
      household: 'solo',
    }));
    const coupleResult = computeExposureScore(makeInput({
      commuteCrimes: violentCrimes,
      household: 'couple',
    }));

    expect(coupleResult.commute).toBeLessThan(soloResult.commute);
  });

  it('family scores higher for drug crimes near home', () => {
    const drugCrimes = Array.from({ length: 30 }, () =>
      makeCrime({ nibrs_code: '35A', nibrs_category: 'Society', occurred_hour: 15 }),
    );

    const soloResult = computeExposureScore(makeInput({
      homeCrimes: drugCrimes,
      household: 'solo',
    }));
    const familyResult = computeExposureScore(makeInput({
      homeCrimes: drugCrimes,
      household: 'family',
    }));

    expect(familyResult.home).toBeGreaterThan(soloResult.home);
  });

  it('defaults to solo when household not specified', () => {
    const crimes = Array.from({ length: 10 }, () =>
      makeCrime({ nibrs_code: '13A', occurred_hour: 8 }),
    );

    const noHousehold = computeExposureScore(makeInput({
      commuteCrimes: crimes,
    }));
    const explicitSolo = computeExposureScore(makeInput({
      commuteCrimes: crimes,
      household: 'solo',
    }));

    expect(noHousehold.total).toBe(explicitSolo.total);
  });
});
