import { useState, useEffect } from 'react';
import { fetchCrimeStats, type StatsEntry } from '../lib/api.js';
import { CATEGORY_COLORS } from '../lib/geojson.js';
import type { CityId } from '../lib/cities.js';

const CATEGORIES = ['Violent', 'Property', 'Society', 'Other'] as const;

interface StatsPanelProps {
  selectedCity: CityId;
  activeCategories: Set<string>;
  onCategoryToggle: (category: string) => void;
}

export default function StatsPanel({ selectedCity, activeCategories, onCategoryToggle }: StatsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [hourStats, setHourStats] = useState<StatsEntry[]>([]);
  const [categoryStats, setCategoryStats] = useState<StatsEntry[]>([]);

  useEffect(() => {
    Promise.all([
      fetchCrimeStats({ city: selectedCity, groupBy: 'hour' }),
      fetchCrimeStats({ city: selectedCity, groupBy: 'nibrs_category' }),
    ])
      .then(([hourRes, catRes]) => {
        setHourStats(hourRes.data);
        setCategoryStats(catRes.data);
      })
      .catch((err) => console.warn('Failed to load stats:', err));
  }, [selectedCity]);

  const totalCrimes = categoryStats.reduce((sum, s) => sum + s.count, 0);
  const maxHourCount = Math.max(1, ...hourStats.map(s => s.count));

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: 'absolute',
          top: 60,
          left: 12,
          zIndex: 10,
          padding: '8px 12px',
          borderRadius: 6,
          border: '1px solid #ccc',
          background: 'rgba(255,255,255,0.95)',
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        Stats
      </button>
    );
  }

  return (
    <div style={{
      position: 'absolute',
      top: 60,
      left: 12,
      zIndex: 10,
      width: 240,
      maxHeight: 'calc(100vh - 120px)',
      overflowY: 'auto',
      background: 'rgba(255,255,255,0.95)',
      borderRadius: 8,
      padding: 16,
      fontSize: 13,
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong style={{ fontSize: 14 }}>Crime Stats</strong>
        <button
          onClick={() => setCollapsed(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0 }}
        >
          &times;
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ color: '#666', marginBottom: 4 }}>Total crimes</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{totalCrimes.toLocaleString()}</div>
      </div>

      {/* Category filters */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ color: '#666', marginBottom: 6 }}>Categories</div>
        {CATEGORIES.map(cat => {
          const stat = categoryStats.find(s => s.group === cat);
          const active = activeCategories.has(cat);
          return (
            <label
              key={cat}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 4,
                cursor: 'pointer',
                opacity: active ? 1 : 0.4,
              }}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => onCategoryToggle(cat)}
              />
              <span style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: CATEGORY_COLORS[cat],
                display: 'inline-block',
              }} />
              <span style={{ flex: 1 }}>{cat}</span>
              <span style={{ color: '#999' }}>{stat ? stat.count.toLocaleString() : '—'}</span>
            </label>
          );
        })}
      </div>

      {/* Hour distribution bar chart */}
      <div>
        <div style={{ color: '#666', marginBottom: 6 }}>By hour</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 60 }}>
          {Array.from({ length: 24 }, (_, h) => {
            const stat = hourStats.find(s => Number(s.group) === h);
            const count = stat?.count ?? 0;
            const height = (count / maxHourCount) * 100;
            return (
              <div
                key={h}
                title={`${String(h).padStart(2, '0')}:00 — ${count} crimes`}
                style={{
                  flex: 1,
                  height: `${height}%`,
                  background: '#1e88e5',
                  borderRadius: '2px 2px 0 0',
                  minHeight: 1,
                }}
              />
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#999', marginTop: 2 }}>
          <span>0h</span>
          <span>6h</span>
          <span>12h</span>
          <span>18h</span>
          <span>23h</span>
        </div>
      </div>
    </div>
  );
}
