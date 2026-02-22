/**
 * Time-based lighting color interpolation for map visualization.
 * Defines keyframe colors for different times of day and provides
 * smooth interpolation between them.
 */

interface LightingConfig {
  skyColor: string;        // Background/ambient color
  lightColor: string;      // MapLibre light color
  buildingColor: string;   // 3D building fill color
  buildingOpacity: number; // Building fill-extrusion opacity
  crimeStroke: string;     // Crime point stroke color
  crimeOpacity: number;    // Crime point opacity
}

// Keyframe colors at specific hours (0-23)
// Format: [hour, config]
const KEYFRAMES: [number, LightingConfig][] = [
  [0,  { skyColor: '#0a0a1a', lightColor: '#1a1a2e', buildingColor: '#223', buildingOpacity: 0.8, crimeStroke: '#333', crimeOpacity: 0.85 }],
  [4,  { skyColor: '#1a1035', lightColor: '#2d1f4e', buildingColor: '#334', buildingOpacity: 0.8, crimeStroke: '#333', crimeOpacity: 0.85 }],
  [6,  { skyColor: '#ff7043', lightColor: '#ffab91', buildingColor: '#887', buildingOpacity: 0.7, crimeStroke: '#666', crimeOpacity: 0.75 }],
  [8,  { skyColor: '#ffcc80', lightColor: '#fff3e0', buildingColor: '#aa9', buildingOpacity: 0.65, crimeStroke: '#ccc', crimeOpacity: 0.7 }],
  [10, { skyColor: '#b3e5fc', lightColor: '#ffffff', buildingColor: '#aaa', buildingOpacity: 0.6, crimeStroke: '#fff', crimeOpacity: 0.7 }],
  [14, { skyColor: '#b3e5fc', lightColor: '#ffffff', buildingColor: '#aaa', buildingOpacity: 0.6, crimeStroke: '#fff', crimeOpacity: 0.7 }],
  [17, { skyColor: '#ff8a65', lightColor: '#ffccbc', buildingColor: '#a97', buildingOpacity: 0.65, crimeStroke: '#ccc', crimeOpacity: 0.75 }],
  [19, { skyColor: '#bf360c', lightColor: '#e65100', buildingColor: '#664', buildingOpacity: 0.75, crimeStroke: '#666', crimeOpacity: 0.8 }],
  [20, { skyColor: '#1a1035', lightColor: '#2d1f4e', buildingColor: '#334', buildingOpacity: 0.8, crimeStroke: '#333', crimeOpacity: 0.85 }],
  [23, { skyColor: '#0a0a1a', lightColor: '#1a1a2e', buildingColor: '#223', buildingOpacity: 0.8, crimeStroke: '#333', crimeOpacity: 0.85 }],
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(
    ar + (br - ar) * t,
    ag + (bg - ag) * t,
    ab + (bb - ab) * t,
  );
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpConfig(a: LightingConfig, b: LightingConfig, t: number): LightingConfig {
  return {
    skyColor: lerpColor(a.skyColor, b.skyColor, t),
    lightColor: lerpColor(a.lightColor, b.lightColor, t),
    buildingColor: lerpColor(a.buildingColor, b.buildingColor, t),
    buildingOpacity: lerp(a.buildingOpacity, b.buildingOpacity, t),
    crimeStroke: lerpColor(a.crimeStroke, b.crimeStroke, t),
    crimeOpacity: lerp(a.crimeOpacity, b.crimeOpacity, t),
  };
}

/**
 * Get interpolated lighting configuration for a given hour.
 */
export function getLightingForHour(hour: number): LightingConfig {
  const h = ((hour % 24) + 24) % 24;

  // Find surrounding keyframes
  let lo = KEYFRAMES[KEYFRAMES.length - 1];
  let hi = KEYFRAMES[0];

  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (h >= KEYFRAMES[i][0] && h < KEYFRAMES[i + 1][0]) {
      lo = KEYFRAMES[i];
      hi = KEYFRAMES[i + 1];
      break;
    }
  }

  // Edge case: hour exactly matches a keyframe
  if (lo[0] === h) return lo[1];

  const range = hi[0] - lo[0];
  const t = range > 0 ? (h - lo[0]) / range : 0;

  return lerpConfig(lo[1], hi[1], t);
}

export type { LightingConfig };
