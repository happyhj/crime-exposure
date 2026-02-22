import { CITIES, CITY_IDS, type CityId } from '../lib/cities.js';

interface CitySelectorProps {
  selectedCity: CityId;
  onCityChange: (city: CityId) => void;
  loading?: boolean;
}

export default function CitySelector({ selectedCity, onCityChange, loading }: CitySelectorProps) {
  return (
    <div style={{
      position: 'absolute',
      top: 12,
      left: 12,
      zIndex: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <select
        value={selectedCity}
        onChange={(e) => onCityChange(e.target.value as CityId)}
        style={{
          padding: '8px 12px',
          borderRadius: 6,
          border: '1px solid #ccc',
          background: 'rgba(255,255,255,0.95)',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {CITY_IDS.map((id) => (
          <option key={id} value={id}>{CITIES[id].name}</option>
        ))}
      </select>
      {loading && (
        <span style={{
          color: '#fff',
          background: 'rgba(0,0,0,0.7)',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 12,
        }}>
          Loading...
        </span>
      )}
    </div>
  );
}
