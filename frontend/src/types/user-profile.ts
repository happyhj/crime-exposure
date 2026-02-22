export interface Location {
  address: string;
  lat: number;
  lon: number;
}

export interface Candidate {
  id: string;
  address: string;
  lat: number;
  lon: number;
}

export type Household = 'solo' | 'couple' | 'family';

export interface UserProfile {
  workplace: Location | null;
  candidates: Candidate[]; // 1~3
  commuteStart: number; // 0-23
  commuteEnd: number;   // 0-23
  household: Household;
}

export function createDefaultProfile(): UserProfile {
  return {
    workplace: null,
    candidates: [],
    commuteStart: 8,
    commuteEnd: 18,
    household: 'solo',
  };
}

export function isProfileReady(profile: UserProfile): boolean {
  return profile.workplace !== null && profile.candidates.length >= 1;
}
