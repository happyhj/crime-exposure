import { useState, useCallback } from 'react';
import MapView from './components/MapView.js';
import TimeSlider from './components/TimeSlider.js';

export default function App() {
  const [selectedHour, setSelectedHour] = useState(12);

  const handleTimeChange = useCallback((hour: number) => {
    setSelectedHour(hour);
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapView selectedHour={selectedHour} />
      <TimeSlider onTimeChange={handleTimeChange} />
    </div>
  );
}
