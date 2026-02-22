import { useState, useRef, useEffect, useCallback } from 'react';
import { forwardGeocode, type GeocodingResult } from '../services/geocoding.js';

interface AddressInputProps {
  placeholder: string;
  value: string;
  resolved: { lat: number; lon: number } | null;
  onChange: (text: string) => void;
  onSelect: (result: GeocodingResult) => void;
}

const DEBOUNCE_MS = 400;

export default function AddressInput({ placeholder, value, resolved, onChange, onSelect }: AddressInputProps) {
  const [suggestions, setSuggestions] = useState<GeocodingResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced geocode on input change
  const handleInput = useCallback((text: string) => {
    onChange(text);
    if (timerRef.current) clearTimeout(timerRef.current);

    if (text.trim().length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const results = await forwardGeocode(text, 5);
      setSuggestions(results);
      setShowDropdown(results.length > 0);
      setLoading(false);
    }, DEBOUNCE_MS);
  }, [onChange]);

  const handleSelect = useCallback((result: GeocodingResult) => {
    onSelect(result);
    onChange(result.displayName);
    setShowDropdown(false);
    setSuggestions([]);
  }, [onSelect, onChange]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Cleanup timer
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
        style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: 6,
          border: `1px solid ${resolved ? '#4fc3f766' : 'rgba(255,255,255,0.15)'}`,
          background: 'rgba(255,255,255,0.05)',
          color: '#fff',
          fontSize: 13,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />

      {loading && (
        <span style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 10,
          color: '#888',
        }}>
          ...
        </span>
      )}

      {resolved && (
        <div style={{ fontSize: 10, color: '#4fc3f7', marginTop: 2 }}>
          ({resolved.lat.toFixed(4)}, {resolved.lon.toFixed(4)})
        </div>
      )}

      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 200,
          background: '#16213e',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 6,
          marginTop: 2,
          maxHeight: 200,
          overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}>
          {suggestions.map((s, i) => (
            <div
              key={i}
              onClick={() => handleSelect(s)}
              style={{
                padding: '8px 12px',
                fontSize: 12,
                color: '#ddd',
                cursor: 'pointer',
                borderBottom: i < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(79,195,247,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {s.displayName}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
