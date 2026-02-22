import { useState, useCallback } from 'react';
import MapView from './components/MapView.js';
import TimeSlider from './components/TimeSlider.js';
import CitySelector from './components/CitySelector.js';
import StatsPanel from './components/StatsPanel.js';
import OnboardingPanel from './components/OnboardingPanel.js';
import Dashboard from './components/Dashboard.js';
import type { CityId } from './lib/cities.js';
import type { CrimeRecord } from './lib/api.js';
import type { UserProfile } from './types/user-profile.js';
import { createDefaultProfile } from './types/user-profile.js';
import type { RouteResult } from './services/routing.js';
import type { CrimePoint } from './utils/route-segments.js';

export type YearRange = [number, number];

export interface RouteOverlayData {
  candidateId: string;
  route: RouteResult;
  crimes: CrimePoint[];
  color: string;
}

type AppMode = 'explore' | 'onboarding' | 'analysis';

export default function App() {
  const [mode, setMode] = useState<AppMode>('explore');
  const [profile, setProfile] = useState<UserProfile>(createDefaultProfile);

  const [selectedHour, setSelectedHour] = useState(12);
  const [selectedCity, setSelectedCity] = useState<CityId>('seattle');
  const [yearRange, setYearRange] = useState<YearRange>([2024, 2025]);
  const [loading, setLoading] = useState(false);
  const [activeCodes, setActiveCodes] = useState<Set<string> | null>(null);
  const [crimeRecords, setCrimeRecords] = useState<CrimeRecord[]>([]);
  const [routeOverlays, setRouteOverlays] = useState<RouteOverlayData[]>([]);

  const handleTimeChange = useCallback((hour: number) => {
    setSelectedHour(hour);
  }, []);

  const handleCityChange = useCallback((city: CityId) => {
    setSelectedCity(city);
    setLoading(true);
    setActiveCodes(null);
  }, []);

  const handleYearRangeChange = useCallback((range: YearRange) => {
    setYearRange(range);
    setLoading(true);
  }, []);

  const handleDataLoaded = useCallback((records: CrimeRecord[]) => {
    setCrimeRecords(records);
    setLoading(false);
  }, []);

  const handleCodesChange = useCallback((codes: Set<string>) => {
    setActiveCodes(codes);
  }, []);

  const handleAnalyze = useCallback(() => {
    setRouteOverlays([]);
    setMode('analysis');
  }, []);

  const handleBackToOnboarding = useCallback(() => {
    setMode('onboarding');
  }, []);

  const handleBackToExplore = useCallback(() => {
    setRouteOverlays([]);
    setMode('explore');
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapView
        selectedHour={selectedHour}
        selectedCity={selectedCity}
        yearRange={yearRange}
        activeCodes={activeCodes}
        onDataLoaded={handleDataLoaded}
        routeOverlays={mode === 'analysis' ? routeOverlays : []}
      />
      <CitySelector
        selectedCity={selectedCity}
        yearRange={yearRange}
        onCityChange={handleCityChange}
        onYearRangeChange={handleYearRangeChange}
        loading={loading}
      />
      <StatsPanel
        selectedCity={selectedCity}
        yearRange={yearRange}
        activeCodes={activeCodes}
        onCodesChange={handleCodesChange}
        crimeRecords={crimeRecords}
      />
      <TimeSlider onTimeChange={handleTimeChange} />

      {/* Exposure mode toggle */}
      {mode === 'explore' && (
        <button
          onClick={() => setMode('onboarding')}
          style={{
            position: 'absolute',
            top: 12,
            right: 60,
            zIndex: 10,
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#4fc3f7',
            color: '#000',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          Crime Exposure
        </button>
      )}

      {mode === 'analysis' && (
        <Dashboard
          profile={profile}
          onBack={handleBackToOnboarding}
          onExplore={handleBackToExplore}
          onRoutesReady={setRouteOverlays}
        />
      )}

      {mode === 'onboarding' && (
        <OnboardingPanel
          profile={profile}
          onProfileChange={setProfile}
          onAnalyze={handleAnalyze}
        />
      )}
    </div>
  );
}
