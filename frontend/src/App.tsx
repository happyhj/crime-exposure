import { useState, useCallback } from 'react';
import MapView from './components/MapView.js';
import TimeSlider from './components/TimeSlider.js';
import CitySelector from './components/CitySelector.js';
import StatsPanel from './components/StatsPanel.js';
import type { CityId } from './lib/cities.js';
import type { CrimeRecord } from './lib/api.js';

export type YearRange = [number, number];

export default function App() {
  const [selectedHour, setSelectedHour] = useState(12);
  const [selectedCity, setSelectedCity] = useState<CityId>('seattle');
  const [yearRange, setYearRange] = useState<YearRange>([2024, 2025]);
  const [loading, setLoading] = useState(false);
  const [activeCodes, setActiveCodes] = useState<Set<string> | null>(null); // null = all selected
  const [crimeRecords, setCrimeRecords] = useState<CrimeRecord[]>([]);

  const handleTimeChange = useCallback((hour: number) => {
    setSelectedHour(hour);
  }, []);

  const handleCityChange = useCallback((city: CityId) => {
    setSelectedCity(city);
    setLoading(true);
    setActiveCodes(null); // reset to all on city switch
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

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapView
        selectedHour={selectedHour}
        selectedCity={selectedCity}
        yearRange={yearRange}
        activeCodes={activeCodes}
        onDataLoaded={handleDataLoaded}
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
    </div>
  );
}
