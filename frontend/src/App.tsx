import { useState, useCallback } from 'react';
import MapView from './components/MapView.js';
import TimeSlider from './components/TimeSlider.js';
import CitySelector from './components/CitySelector.js';
import type { CityId } from './lib/cities.js';

export default function App() {
  const [selectedHour, setSelectedHour] = useState(12);
  const [selectedCity, setSelectedCity] = useState<CityId>('seattle');
  const [loading, setLoading] = useState(false);

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

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapView
        selectedHour={selectedHour}
        selectedCity={selectedCity}
        onDataLoaded={handleDataLoaded}
      />
      <CitySelector
        selectedCity={selectedCity}
        onCityChange={handleCityChange}
        loading={loading}
      />
      <TimeSlider onTimeChange={handleTimeChange} />
    </div>
  );
}
