import { useState, useCallback } from 'react';
import MapView from './components/MapView.js';
import TimeSlider from './components/TimeSlider.js';
import CitySelector from './components/CitySelector.js';
import StatsPanel from './components/StatsPanel.js';
import type { CityId } from './lib/cities.js';

const ALL_CATEGORIES = new Set(['Violent', 'Property', 'Society', 'Other']);

export default function App() {
  const [selectedHour, setSelectedHour] = useState(12);
  const [selectedCity, setSelectedCity] = useState<CityId>('seattle');
  const [loading, setLoading] = useState(false);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set(ALL_CATEGORIES));

  const handleTimeChange = useCallback((hour: number) => {
    setSelectedHour(hour);
  }, []);

  const handleCityChange = useCallback((city: CityId) => {
    setSelectedCity(city);
    setLoading(true);
  }, []);

  const handleDataLoaded = useCallback(() => {
    setLoading(false);
  }, []);

  const handleCategoryToggle = useCallback((category: string) => {
    setActiveCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapView
        selectedHour={selectedHour}
        selectedCity={selectedCity}
        activeCategories={activeCategories}
        onDataLoaded={handleDataLoaded}
      />
      <CitySelector
        selectedCity={selectedCity}
        onCityChange={handleCityChange}
        loading={loading}
      />
      <StatsPanel
        selectedCity={selectedCity}
        activeCategories={activeCategories}
        onCategoryToggle={handleCategoryToggle}
      />
      <TimeSlider onTimeChange={handleTimeChange} />
    </div>
  );
}
