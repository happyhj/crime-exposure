import { useState, useEffect, useMemo } from 'react';
import { fetchCrimeStats, type StatsEntry, type CrimeRecord } from '../lib/api.js';
import { CATEGORY_COLORS } from '../lib/geojson.js';
import { getNibrsLabel } from '../lib/nibrs-labels.js';
import type { CityId } from '../lib/cities.js';

const CATEGORY_INFO: Record<string, { label: string; description: string }> = {
  Violent: {
    label: 'Violent',
    description: 'Homicide, assault, robbery, sexual offenses, kidnapping',
  },
  Property: {
    label: 'Property',
    description: 'Theft, burglary, motor vehicle theft, arson, fraud, vandalism',
  },
  Society: {
    label: 'Society',
    description: 'Drug offenses, weapon violations, prostitution, gambling, DUI',
  },
  Other: {
    label: 'Other',
    description: 'Trespass, disorderly conduct, loitering, misc. offenses',
  },
};

const CATEGORIES = Object.keys(CATEGORY_INFO);

interface StatsPanelProps {
  selectedCity: CityId;
  yearRange: [number, number];
  activeCodes: Set<string> | null;
  onCodesChange: (codes: Set<string>) => void;
  crimeRecords: CrimeRecord[];
}

export default function StatsPanel({ selectedCity, yearRange, activeCodes, onCodesChange, crimeRecords }: StatsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [codeStats, setCodeStats] = useState<StatsEntry[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchCrimeStats({
      city: selectedCity,
      groupBy: 'nibrs_code',
      from: `${yearRange[0]}-01`,
      to: `${yearRange[1]}-12`,
    })
      .then(res => setCodeStats(res.data))
      .catch(err => console.warn('Failed to load stats:', err));
  }, [selectedCity, yearRange]);

  // Group codes by category
  const codesByCategory = useMemo(() => {
    const map: Record<string, StatsEntry[]> = {};
    for (const cat of CATEGORIES) map[cat] = [];
    for (const s of codeStats) {
      const cat = s.category ?? 'Other';
      if (!map[cat]) map[cat] = [];
      map[cat].push(s);
    }
    return map;
  }, [codeStats]);

  // All known codes
  const allCodes = useMemo(() => new Set(codeStats.map(s => s.key)), [codeStats]);

  // Effective active codes (null = all)
  const effectiveCodes = activeCodes ?? allCodes;

  // Category totals and selected counts
  const categoryTotals = useMemo(() => {
    const totals: Record<string, { total: number; selected: number }> = {};
    for (const cat of CATEGORIES) {
      const codes = codesByCategory[cat];
      const total = codes.reduce((s, c) => s + c.count, 0);
      const selected = codes.filter(c => effectiveCodes.has(c.key)).reduce((s, c) => s + c.count, 0);
      totals[cat] = { total, selected };
    }
    return totals;
  }, [codesByCategory, effectiveCodes]);

  const totalCrimes = Object.values(categoryTotals).reduce((s, t) => s + t.total, 0);
  const selectedCrimes = Object.values(categoryTotals).reduce((s, t) => s + t.selected, 0);
  const isSubset = activeCodes !== null && activeCodes.size < allCodes.size;

  // Hour distribution from loaded records, filtered by active codes
  const hourDistribution = useMemo(() => {
    const hours = new Array(24).fill(0);
    for (const r of crimeRecords) {
      if (effectiveCodes.has(r.nibrs_code) && r.occurred_hour != null) {
        hours[r.occurred_hour]++;
      }
    }
    return hours;
  }, [crimeRecords, effectiveCodes]);

  const maxHourCount = Math.max(1, ...hourDistribution);

  function toggleExpand(cat: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function toggleCategory(cat: string) {
    const codes = codesByCategory[cat].map(c => c.key);
    const allSelected = codes.every(c => effectiveCodes.has(c));

    const next = new Set(effectiveCodes);
    if (allSelected) {
      // Deselect all codes in this category
      for (const c of codes) next.delete(c);
    } else {
      // Select all codes in this category
      for (const c of codes) next.add(c);
    }
    onCodesChange(next);
  }

  function toggleCode(code: string) {
    const next = new Set(effectiveCodes);
    if (next.has(code)) {
      next.delete(code);
    } else {
      next.add(code);
    }
    onCodesChange(next);
  }

  function isCategoryChecked(cat: string): boolean {
    const codes = codesByCategory[cat].map(c => c.key);
    return codes.length > 0 && codes.every(c => effectiveCodes.has(c));
  }

  function isCategoryIndeterminate(cat: string): boolean {
    const codes = codesByCategory[cat].map(c => c.key);
    const selectedCount = codes.filter(c => effectiveCodes.has(c)).length;
    return selectedCount > 0 && selectedCount < codes.length;
  }

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
      width: 290,
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
        <div style={{ color: '#666', marginBottom: 4 }}>
          {isSubset ? 'Selected / Total' : 'Total crimes'}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>
          {isSubset
            ? <>{selectedCrimes.toLocaleString()} <span style={{ fontSize: 14, fontWeight: 400, color: '#999' }}>/ {totalCrimes.toLocaleString()}</span></>
            : totalCrimes.toLocaleString()
          }
        </div>
      </div>

      {/* Category filters with expandable sub-codes */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ color: '#666', marginBottom: 6 }}>Categories</div>
        {CATEGORIES.map(cat => {
          const info = CATEGORY_INFO[cat];
          const { total, selected } = categoryTotals[cat];
          const checked = isCategoryChecked(cat);
          const indeterminate = isCategoryIndeterminate(cat);
          const expanded = expandedCategories.has(cat);
          const subCodes = codesByCategory[cat];
          const catActive = checked || indeterminate;

          return (
            <div key={cat} style={{ marginBottom: 6 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  cursor: 'pointer',
                  opacity: catActive ? 1 : 0.4,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  ref={el => { if (el) el.indeterminate = indeterminate; }}
                  onChange={() => toggleCategory(cat)}
                  style={{ marginTop: 2 }}
                />
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: CATEGORY_COLORS[cat],
                  display: 'inline-block',
                  marginTop: 3,
                  flexShrink: 0,
                }} />
                <span
                  style={{ flex: 1, userSelect: 'none' }}
                  onClick={() => toggleExpand(cat)}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                      <span style={{ marginRight: 4, fontSize: 10 }}>{expanded ? '\u25BC' : '\u25B6'}</span>
                      {info.label}
                    </span>
                    <span style={{ color: '#999', fontSize: 12 }}>
                      {isSubset && selected !== total
                        ? <><strong style={{ color: '#333' }}>{selected.toLocaleString()}</strong> / {total.toLocaleString()}</>
                        : total.toLocaleString()
                      }
                    </span>
                  </span>
                  <span style={{ display: 'block', fontSize: 10, color: '#999', lineHeight: 1.3, marginTop: 1 }}>
                    {info.description}
                  </span>
                </span>
              </div>

              {/* Sub-codes (expandable) */}
              {expanded && subCodes.length > 0 && (
                <div style={{ marginLeft: 20, marginTop: 4, borderLeft: `2px solid ${CATEGORY_COLORS[cat]}44`, paddingLeft: 8 }}>
                  {subCodes.map(sc => {
                    const codeActive = effectiveCodes.has(sc.key);
                    return (
                      <label
                        key={sc.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          padding: '2px 0',
                          cursor: 'pointer',
                          opacity: codeActive ? 1 : 0.4,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={codeActive}
                          onChange={() => toggleCode(sc.key)}
                          style={{ width: 12, height: 12 }}
                        />
                        <span style={{ flex: 1 }} title={`NIBRS ${sc.key}`}>{getNibrsLabel(sc.key)}</span>
                        <span style={{ color: '#999', flexShrink: 0 }}>{sc.count.toLocaleString()}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hour distribution bar chart */}
      <div>
        <div style={{ color: '#666', marginBottom: 6 }}>
          By hour {isSubset && <span style={{ fontSize: 10, color: '#aaa' }}>(filtered)</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 60 }}>
          {hourDistribution.map((count, h) => {
            const height = (count / maxHourCount) * 100;
            return (
              <div
                key={h}
                title={`${String(h).padStart(2, '0')}:00 — ${count.toLocaleString()} crimes`}
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
