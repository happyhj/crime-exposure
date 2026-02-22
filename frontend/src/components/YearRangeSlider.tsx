import { useCallback, useEffect, useRef, useState } from 'react';
import type { YearRange } from '../App.js';

const MIN_YEAR = 2015;
const MAX_YEAR = 2025;
const TOTAL = MAX_YEAR - MIN_YEAR;

interface YearRangeSliderProps {
  value: YearRange;
  onChange: (range: YearRange) => void;
}

export default function YearRangeSlider({ value, onChange }: YearRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Local state for immediate visual feedback during drag
  const [local, setLocal] = useState<YearRange>(value);

  // Sync local state when parent value changes (e.g. reset)
  useEffect(() => {
    setLocal(value);
  }, [value]);

  const pct = (year: number) => ((year - MIN_YEAR) / TOTAL) * 100;

  const handlePointer = useCallback(
    (thumb: 'lo' | 'hi') => (e: React.PointerEvent) => {
      e.preventDefault();
      const track = trackRef.current;
      if (!track) return;

      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);

      let latest: YearRange = [...local] as YearRange;

      const move = (ev: PointerEvent) => {
        const rect = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const year = Math.round(MIN_YEAR + ratio * TOTAL);

        let next: YearRange;
        if (thumb === 'lo') {
          const clamped = Math.min(year, latest[1]);
          if (clamped === latest[0]) return;
          next = [clamped, latest[1]];
        } else {
          const clamped = Math.max(year, latest[0]);
          if (clamped === latest[1]) return;
          next = [latest[0], clamped];
        }

        latest = next;
        setLocal(next);  // visual only, no API call
      };

      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        // Fire onChange only on release
        if (latest[0] !== value[0] || latest[1] !== value[1]) {
          onChange(latest);
        }
      };

      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    },
    [local, onChange, value],
  );

  const leftPct = pct(local[0]);
  const rightPct = pct(local[1]);

  // Tick marks for each year
  const ticks = Array.from({ length: TOTAL + 1 }, (_, i) => MIN_YEAR + i);

  return (
    <div style={{ width: 200, userSelect: 'none' }}>
      <div
        ref={trackRef}
        style={{
          position: 'relative',
          height: 28,
          cursor: 'default',
        }}
      >
        {/* Background track */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 0,
            right: 0,
            height: 4,
            background: 'rgba(255,255,255,0.25)',
            borderRadius: 2,
          }}
        />

        {/* Active range */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: `${leftPct}%`,
            width: `${rightPct - leftPct}%`,
            height: 4,
            background: '#4fc3f7',
            borderRadius: 2,
          }}
        />

        {/* Tick marks */}
        {ticks.map((y) => (
          <div
            key={y}
            style={{
              position: 'absolute',
              top: 18,
              left: `${pct(y)}%`,
              width: 1,
              height: y % 5 === 0 ? 6 : 3,
              background: 'rgba(255,255,255,0.35)',
              transform: 'translateX(-0.5px)',
            }}
          />
        ))}

        {/* Low thumb */}
        <div
          onPointerDown={handlePointer('lo')}
          style={{
            position: 'absolute',
            top: 6,
            left: `${leftPct}%`,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            border: '2px solid #4fc3f7',
            transform: 'translateX(-8px)',
            cursor: 'grab',
            zIndex: 2,
            touchAction: 'none',
          }}
        />

        {/* High thumb */}
        <div
          onPointerDown={handlePointer('hi')}
          style={{
            position: 'absolute',
            top: 6,
            left: `${rightPct}%`,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            border: '2px solid #4fc3f7',
            transform: 'translateX(-8px)',
            cursor: 'grab',
            zIndex: 2,
            touchAction: 'none',
          }}
        />
      </div>

      {/* Labels */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: 'rgba(255,255,255,0.5)',
          marginTop: -2,
        }}
      >
        <span>{MIN_YEAR}</span>
        <span>{MAX_YEAR}</span>
      </div>
    </div>
  );
}
