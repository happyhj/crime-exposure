import { useState, useCallback } from 'react';
import type { UserProfile, Candidate, Household } from '../types/user-profile.js';
import { isProfileReady } from '../types/user-profile.js';

interface OnboardingPanelProps {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
  onAnalyze: () => void;
}

let nextCandidateId = 1;

export default function OnboardingPanel({ profile, onProfileChange, onAnalyze }: OnboardingPanelProps) {
  const [workInput, setWorkInput] = useState(profile.workplace?.address ?? '');
  const [candidateInputs, setCandidateInputs] = useState<Record<string, string>>({});

  const ready = isProfileReady(profile);

  const updateWorkplace = useCallback((address: string, lat: number, lon: number) => {
    onProfileChange({ ...profile, workplace: { address, lat, lon } });
  }, [profile, onProfileChange]);

  const addCandidate = useCallback(() => {
    if (profile.candidates.length >= 3) return;
    const id = `c${nextCandidateId++}`;
    const candidate: Candidate = { id, address: '', lat: 0, lon: 0 };
    onProfileChange({ ...profile, candidates: [...profile.candidates, candidate] });
  }, [profile, onProfileChange]);

  const updateCandidate = useCallback((id: string, address: string, lat: number, lon: number) => {
    const updated = profile.candidates.map(c =>
      c.id === id ? { ...c, address, lat, lon } : c,
    );
    onProfileChange({ ...profile, candidates: updated });
  }, [profile, onProfileChange]);

  const removeCandidate = useCallback((id: string) => {
    onProfileChange({
      ...profile,
      candidates: profile.candidates.filter(c => c.id !== id),
    });
    setCandidateInputs(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, [profile, onProfileChange]);

  const setCommute = useCallback((field: 'commuteStart' | 'commuteEnd', value: number) => {
    onProfileChange({ ...profile, [field]: value });
  }, [profile, onProfileChange]);

  const setHousehold = useCallback((h: Household) => {
    onProfileChange({ ...profile, household: h });
  }, [profile, onProfileChange]);

  // Simple geocoding stub — will be replaced by Nominatim in #36
  const geocodeAddress = async (address: string): Promise<{ lat: number; lon: number } | null> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us`,
        { headers: { 'User-Agent': 'CrimeExposure/1.0' } },
      );
      const data = await res.json();
      if (data.length === 0) return null;
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    } catch {
      return null;
    }
  };

  const handleWorkGeocode = async () => {
    if (!workInput.trim()) return;
    const result = await geocodeAddress(workInput);
    if (result) {
      updateWorkplace(workInput, result.lat, result.lon);
    }
  };

  const handleCandidateGeocode = async (id: string) => {
    const input = candidateInputs[id];
    if (!input?.trim()) return;
    const result = await geocodeAddress(input);
    if (result) {
      updateCandidate(id, input, result.lat, result.lon);
    }
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 100,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <div style={{
        background: '#1a1a2e',
        borderRadius: 16,
        padding: 32,
        width: 480,
        maxHeight: '90vh',
        overflowY: 'auto',
        color: '#e0e0e0',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, color: '#fff' }}>
          Crime Exposure Analysis
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#888' }}>
          Compare safety scores for candidate homes based on your commute.
        </p>

        {/* Workplace */}
        <Section label="Workplace" icon="🏢">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Enter work address..."
              value={workInput}
              onChange={e => setWorkInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleWorkGeocode()}
              style={inputStyle}
            />
            <button onClick={handleWorkGeocode} style={btnSecondary}>
              Search
            </button>
          </div>
          {profile.workplace && (
            <div style={{ fontSize: 11, color: '#4fc3f7', marginTop: 4 }}>
              ({profile.workplace.lat.toFixed(4)}, {profile.workplace.lon.toFixed(4)})
            </div>
          )}
        </Section>

        {/* Candidate Homes */}
        <Section label="Candidate Homes" icon="🏠">
          {profile.candidates.map((c, i) => (
            <div key={c.id} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#888', width: 14, flexShrink: 0 }}>{i + 1}.</span>
                <input
                  type="text"
                  placeholder={`Home address ${i + 1}...`}
                  value={candidateInputs[c.id] ?? c.address}
                  onChange={e => setCandidateInputs(prev => ({ ...prev, [c.id]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleCandidateGeocode(c.id)}
                  style={inputStyle}
                />
                <button onClick={() => handleCandidateGeocode(c.id)} style={btnSecondary}>
                  Search
                </button>
                <button
                  onClick={() => removeCandidate(c.id)}
                  style={{ ...btnSecondary, color: '#ef5350', borderColor: '#ef535044' }}
                >
                  X
                </button>
              </div>
              {c.lat !== 0 && (
                <div style={{ fontSize: 11, color: '#4fc3f7', marginTop: 2, marginLeft: 22 }}>
                  {c.address} ({c.lat.toFixed(4)}, {c.lon.toFixed(4)})
                </div>
              )}
            </div>
          ))}
          {profile.candidates.length < 3 && (
            <button onClick={addCandidate} style={{ ...btnSecondary, width: '100%', marginTop: 4 }}>
              + Add candidate home
            </button>
          )}
        </Section>

        {/* Commute Times */}
        <Section label="Commute Hours" icon="⏰">
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              Leave home
              <select
                value={profile.commuteStart}
                onChange={e => setCommute('commuteStart', Number(e.target.value))}
                style={selectStyle}
              >
                {hours.map(h => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              Leave work
              <select
                value={profile.commuteEnd}
                onChange={e => setCommute('commuteEnd', Number(e.target.value))}
                style={selectStyle}
              >
                {hours.map(h => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </select>
            </label>
          </div>
        </Section>

        {/* Household */}
        <Section label="Household" icon="👤">
          <div style={{ display: 'flex', gap: 8 }}>
            {(['solo', 'couple', 'family'] as Household[]).map(h => (
              <button
                key={h}
                onClick={() => setHousehold(h)}
                style={{
                  ...btnSecondary,
                  flex: 1,
                  background: profile.household === h ? '#4fc3f744' : 'transparent',
                  borderColor: profile.household === h ? '#4fc3f7' : 'rgba(255,255,255,0.15)',
                  color: profile.household === h ? '#4fc3f7' : '#888',
                  fontWeight: profile.household === h ? 600 : 400,
                }}
              >
                {h === 'solo' ? '🧑 Solo' : h === 'couple' ? '👫 Couple' : '👨‍👩‍👧 Family'}
              </button>
            ))}
          </div>
        </Section>

        {/* Analyze Button */}
        <button
          onClick={onAnalyze}
          disabled={!ready}
          style={{
            width: '100%',
            padding: '14px 0',
            borderRadius: 8,
            border: 'none',
            background: ready ? '#4fc3f7' : '#333',
            color: ready ? '#000' : '#666',
            fontSize: 16,
            fontWeight: 700,
            cursor: ready ? 'pointer' : 'not-allowed',
            marginTop: 8,
            transition: 'background 0.2s',
          }}
        >
          Analyze Safety
        </button>

        {!ready && (
          <p style={{ fontSize: 11, color: '#666', textAlign: 'center', margin: '8px 0 0' }}>
            Enter a workplace and at least one candidate home to start.
          </p>
        )}
      </div>
    </div>
  );
}

function Section({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#aaa', marginBottom: 8 }}>
        {icon} {label}
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.05)',
  color: '#fff',
  fontSize: 13,
  outline: 'none',
};

const btnSecondary: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'transparent',
  color: '#aaa',
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const selectStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.15)',
  background: '#1a1a2e',
  color: '#fff',
  fontSize: 13,
};
