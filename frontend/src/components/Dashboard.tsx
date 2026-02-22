import { useState, useEffect, useCallback } from 'react';
import type { UserProfile, Candidate } from '../types/user-profile.js';
import type { ExposureResult } from '../utils/exposure-score.js';
import { computeExposureScore, type ScoreInput, type CrimeRecord as ScoreCrimeRecord } from '../utils/exposure-score.js';
import { getFootRoute, type RouteResult } from '../services/routing.js';
import { fetchCorridorCrimes, fetchRadiusCrimes, type CrimeRecord } from '../lib/api.js';
import type { RouteOverlayData } from '../App.js';

interface DashboardProps {
  profile: UserProfile;
  onBack: () => void;
  onExplore?: () => void;
  onRoutesReady?: (routes: RouteOverlayData[]) => void;
}

type AnalysisStep = 'routing' | 'fetching' | 'scoring' | 'done' | 'error';

interface CandidateResult {
  candidate: Candidate;
  route: RouteResult | null;
  score: ExposureResult | null;
  corridorCrimes: CrimeRecord[];
  loading: boolean;
  step: AnalysisStep;
  error: string | null;
}

function crimeToScoreCrime(c: CrimeRecord): ScoreCrimeRecord {
  return {
    nibrs_code: c.nibrs_code,
    nibrs_category: c.nibrs_category,
    occurred_hour: c.occurred_hour,
    latitude: c.latitude,
    longitude: c.longitude,
  };
}

const CANDIDATE_COLORS = ['#4fc3f7', '#66bb6a', '#ffa726'];

export default function Dashboard({ profile, onBack, onExplore, onRoutesReady }: DashboardProps) {
  const [results, setResults] = useState<CandidateResult[]>([]);

  const analyzeCandidate = useCallback(async (candidate: Candidate, idx: number) => {
    if (!profile.workplace) return;

    setResults(prev => {
      const next = [...prev];
      next[idx] = { candidate, route: null, score: null, corridorCrimes: [], loading: true, step: 'routing', error: null };
      return next;
    });

    try {
      // 1. Get walking route
      const route = await getFootRoute(
        { lat: candidate.lat, lon: candidate.lon },
        { lat: profile.workplace.lat, lon: profile.workplace.lon },
      );

      setResults(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx], route, step: 'fetching' };
        return next;
      });

      // 2. Fetch crimes for scoring (all in parallel)
      const [corridorRes, homeRes, workRes] = await Promise.all([
        // Corridor crimes along commute route
        route ? fetchCorridorCrimes({
          route: { type: 'LineString', coordinates: route.coordinates },
          buffer_meters: 200,
          city: detectCity(candidate.lat, candidate.lon),
          hour_start: profile.commuteStart,
          hour_end: profile.commuteEnd,
        }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),

        // Home area crimes (radius 500m)
        fetchRadiusCrimes({
          lat: candidate.lat,
          lon: candidate.lon,
          radius: '500m',
          limit: 50000,
        }).catch(() => ({ data: [] })),

        // Work area crimes (radius 500m)
        fetchRadiusCrimes({
          lat: profile.workplace.lat,
          lon: profile.workplace.lon,
          radius: '500m',
          limit: 50000,
        }).catch(() => ({ data: [] })),
      ]);

      // 3. Compute score
      const input: ScoreInput = {
        homeCrimes: homeRes.data.map(crimeToScoreCrime),
        commuteCrimes: corridorRes.data.map(crimeToScoreCrime),
        workCrimes: workRes.data.map(crimeToScoreCrime),
        commuteStart: profile.commuteStart,
        commuteEnd: profile.commuteEnd,
        household: profile.household,
      };

      setResults(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx], step: 'scoring' };
        return next;
      });

      const score = computeExposureScore(input);
      const crimeData = corridorRes.data as CrimeRecord[];

      setResults(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx], score, corridorCrimes: crimeData, loading: false, step: 'done' };
        return next;
      });
    } catch (err) {
      setResults(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx], loading: false, step: 'error', error: String(err) };
        return next;
      });
    }
  }, [profile]);

  useEffect(() => {
    setResults(profile.candidates.map(c => ({
      candidate: c,
      route: null,
      score: null,
      corridorCrimes: [],
      loading: false,
      step: 'routing' as AnalysisStep,
      error: null,
    })));

    profile.candidates.forEach((c, i) => {
      analyzeCandidate(c, i);
    });
  }, [profile.candidates, analyzeCandidate]);

  // Emit route overlay data when routes are ready
  useEffect(() => {
    if (!onRoutesReady) return;
    const overlays: RouteOverlayData[] = results
      .filter(r => r.route && !r.loading)
      .map((r, i) => ({
        candidateId: r.candidate.id,
        route: r.route!,
        crimes: r.corridorCrimes
          .filter(c => c.latitude != null && c.longitude != null)
          .map(c => ({ latitude: c.latitude!, longitude: c.longitude! })),
        color: CANDIDATE_COLORS[i % CANDIDATE_COLORS.length],
      }));
    onRoutesReady(overlays);
  }, [results, onRoutesReady]);

  // Find the best candidate (lowest score)
  const bestIdx = results.reduce((best, r, i) => {
    if (!r.score) return best;
    if (best === -1) return i;
    const bestScore = results[best]?.score;
    if (!bestScore) return i;
    return r.score.total < bestScore.total ? i : best;
  }, -1);

  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      background: 'rgba(26,26,46,0.95)',
      borderTop: '1px solid rgba(255,255,255,0.1)',
      padding: '20px 24px',
      maxHeight: '45vh',
      overflowY: 'auto',
      backdropFilter: 'blur(10px)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, color: '#fff', fontSize: 16 }}>
          Crime Exposure Analysis
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onBack} style={backBtnStyle}>
            Edit Profile
          </button>
          {onExplore && (
            <button onClick={onExplore} style={backBtnStyle}>
              Back to Map
            </button>
          )}
        </div>
      </div>

      {/* Candidate Cards */}
      <div style={{
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        {results.map((r, i) => (
          <CandidateCard
            key={r.candidate.id}
            result={r}
            index={i}
            isBest={i === bestIdx && results.filter(x => x.score).length > 1}
          />
        ))}
      </div>
    </div>
  );
}

const STEP_LABELS: Record<AnalysisStep, string> = {
  routing: 'Generating route...',
  fetching: 'Analyzing crime data...',
  scoring: 'Calculating score...',
  done: '',
  error: '',
};

function CandidateCard({ result, index, isBest }: { result: CandidateResult; index: number; isBest: boolean }) {
  const { candidate, route, score, loading, step, error } = result;
  const color = CANDIDATE_COLORS[index % CANDIDATE_COLORS.length];
  const labels = ['A', 'B', 'C'];

  return (
    <div style={{
      flex: '1 1 200px',
      minWidth: 200,
      maxWidth: 320,
      background: 'rgba(255,255,255,0.05)',
      borderRadius: 12,
      padding: 16,
      border: isBest ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.1)',
      position: 'relative',
    }}>
      {isBest && (
        <span style={{
          position: 'absolute',
          top: -10,
          right: 12,
          background: color,
          color: '#000',
          fontSize: 10,
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 4,
        }}>
          BEST
        </span>
      )}

      {/* Candidate header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color, fontWeight: 600, marginBottom: 2 }}>
          Candidate {labels[index]}
        </div>
        <div style={{ fontSize: 13, color: '#ccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {candidate.address || 'Unknown address'}
        </div>
      </div>

      {/* Loading state with step indicator */}
      {loading && (
        <div style={{ padding: '12px 0' }}>
          <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>
            {STEP_LABELS[step]}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['routing', 'fetching', 'scoring'] as AnalysisStep[]).map(s => (
              <div key={s} style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: stepOrder(s) <= stepOrder(step) ? color : 'rgba(255,255,255,0.1)',
                transition: 'background 0.3s',
              }} />
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{ color: '#ef5350', fontSize: 12, padding: '8px 0' }}>
          Analysis failed: {error.includes('fetch') ? 'Network error' : 'Unable to compute route'}
        </div>
      )}

      {/* Score display */}
      {score && !loading && (
        <>
          {/* Main score */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: gradeColor(score.grade) }}>
              {score.total}
            </span>
            <span style={{
              fontSize: 20,
              fontWeight: 700,
              color: gradeColor(score.grade),
              opacity: 0.8,
            }}>
              {score.grade}
            </span>
          </div>

          {/* Sub-scores */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SubScoreBar label="Home" value={score.home} icon="🏠" />
            <SubScoreBar label="Commute" value={score.commute} icon="🚶" />
            <SubScoreBar label="Work" value={score.work} icon="🏢" />
          </div>

          {/* Route info */}
          {route && (
            <div style={{ marginTop: 10, fontSize: 11, color: '#888', display: 'flex', gap: 12 }}>
              <span>{(route.distance / 1000).toFixed(1)} km</span>
              <span>{Math.round(route.duration / 60)} min walk</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SubScoreBar({ label, value, icon }: { label: string; value: number; icon: string }) {
  const barColor = value <= 20 ? '#66bb6a' : value <= 40 ? '#9ccc65' : value <= 60 ? '#ffa726' : value <= 80 ? '#ef5350' : '#d32f2f';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, width: 16 }}>{icon}</span>
      <span style={{ fontSize: 11, color: '#aaa', width: 60 }}>{label}</span>
      <div style={{
        flex: 1,
        height: 6,
        background: 'rgba(255,255,255,0.08)',
        borderRadius: 3,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.min(100, value)}%`,
          height: '100%',
          background: barColor,
          borderRadius: 3,
          transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{ fontSize: 11, color: '#aaa', width: 28, textAlign: 'right' }}>
        {Math.round(value)}
      </span>
    </div>
  );
}

function stepOrder(step: AnalysisStep): number {
  switch (step) {
    case 'routing': return 1;
    case 'fetching': return 2;
    case 'scoring': return 3;
    case 'done': return 4;
    case 'error': return 0;
  }
}

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return '#66bb6a';
    case 'B': return '#9ccc65';
    case 'C': return '#ffa726';
    case 'D': return '#ef5350';
    case 'F': return '#d32f2f';
    default: return '#888';
  }
}

function detectCity(lat: number, lon: number): string {
  // Simple bounding box detection for supported cities
  if (lat > 47.4 && lat < 47.8 && lon > -122.5 && lon < -122.1) return 'seattle';
  if (lat > 41.6 && lat < 42.1 && lon > -87.9 && lon < -87.5) return 'chicago';
  if (lat > 33.7 && lat < 34.4 && lon > -118.7 && lon < -118.1) return 'la';
  if (lat > 32.6 && lat < 33.0 && lon > -97.0 && lon < -96.5) return 'dallas';
  if (lat > 40.4 && lat < 40.9 && lon > -74.3 && lon < -73.7) return 'nyc';
  return 'seattle'; // fallback
}

const backBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'transparent',
  color: '#aaa',
  fontSize: 12,
  cursor: 'pointer',
};
