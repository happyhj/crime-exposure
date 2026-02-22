import { CITIES, CITY_IDS, type CityId } from '../lib/cities.js';
import YearRangeSlider from './YearRangeSlider.js';
import type { YearRange } from '../App.js';

interface CitySelectorProps {
  selectedCity: CityId;
  yearRange: YearRange;
  onCityChange: (city: CityId) => void;
  onYearRangeChange: (range: YearRange) => void;
  loading?: boolean;
}

export default function CitySelector({ selectedCity, yearRange, onCityChange, onYearRangeChange, loading }: CitySelectorProps) {
  const rangeLabel = yearRange[0] === yearRange[1]
    ? `${yearRange[0]}`
    : `${yearRange[0]} – ${yearRange[1]}`;

  return (
    <div style={{
      position: 'absolute',
      top: 12,
      left: 12,
      zIndex: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      background: 'rgba(0,0,0,0.75)',
      padding: '8px 16px',
      borderRadius: 8,
    }}>
      <select
        value={selectedCity}
        onChange={(e) => onCityChange(e.target.value as CityId)}
        style={{
          padding: '6px 10px',
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.3)',
          background: 'rgba(255,255,255,0.1)',
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {CITY_IDS.map((id) => (
          <option key={id} value={id} style={{ color: '#000' }}>{CITIES[id].name}</option>
        ))}
      </select>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, minWidth: 80, textAlign: 'center' }}>
          {rangeLabel}
        </span>
        <YearRangeSlider value={yearRange} onChange={onYearRangeChange} />
      </div>

      {loading && (
        <span style={{
          color: '#4fc3f7',
          fontSize: 12,
          fontWeight: 500,
        }}>
          Loading...
        </span>
      )}
    </div>
  );
}
