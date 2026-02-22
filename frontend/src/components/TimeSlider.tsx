import { useState, useEffect, useRef, useCallback } from 'react';

interface TimeSliderProps {
  onTimeChange: (hour: number) => void;
}

const WINDOW = 2; // ±2 hours

export default function TimeSlider({ onTimeChange }: TimeSliderProps) {
  const [hour, setHour] = useState(12);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleChange = useCallback((newHour: number) => {
    setHour(newHour);
    onTimeChange(newHour);
  }, [onTimeChange]);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setHour((prev) => {
          const next = (prev + 1) % 24;
          onTimeChange(next);
          return next;
        });
      }, 800);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, onTimeChange]);

  const fromHour = (hour - WINDOW + 24) % 24;
  const toHour = (hour + WINDOW) % 24;
  const timeLabel = `${String(fromHour).padStart(2, '0')}:00 – ${String(toHour).padStart(2, '0')}:00`;

  return (
    <div style={{
      position: 'absolute',
      bottom: 30,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.8)',
      color: '#fff',
      padding: '12px 24px',
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      zIndex: 10,
      fontFamily: 'monospace',
    }}>
      <button
        onClick={() => setPlaying(!playing)}
        style={{
          background: 'none',
          border: '1px solid #fff',
          color: '#fff',
          borderRadius: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <input
        type="range"
        min={0}
        max={23}
        value={hour}
        onChange={(e) => handleChange(Number(e.target.value))}
        style={{ width: 200 }}
      />
      <span style={{ minWidth: 130, textAlign: 'center' }}>
        {timeLabel}
      </span>
    </div>
  );
}

export { WINDOW as TIME_WINDOW };
