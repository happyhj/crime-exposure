import SunCalc from 'suncalc';

interface SunPosition {
  /** Azimuth in degrees (0 = north, 90 = east, 180 = south, 270 = west) */
  azimuth: number;
  /** Altitude in degrees above horizon (0 = horizon, 90 = zenith) */
  altitude: number;
}

/**
 * Calculate sun position for a given hour at a specific location and date.
 * Defaults to Seattle coordinates and June 21 (summer solstice for dramatic shadows).
 */
export function getSunPosition(
  hour: number,
  lat = 47.6062,
  lng = -122.3321,
  date = new Date(2024, 5, 21), // June 21
): SunPosition {
  const d = new Date(date);
  d.setHours(hour, 0, 0, 0);

  const pos = SunCalc.getPosition(d, lat, lng);

  // SunCalc returns azimuth relative to south (0 = south, positive = west)
  // Convert to compass bearing (0 = north, 90 = east)
  const azimuthDeg = ((pos.azimuth * 180) / Math.PI + 180) % 360;
  const altitudeDeg = (pos.altitude * 180) / Math.PI;

  return {
    azimuth: azimuthDeg,
    altitude: Math.max(0, altitudeDeg), // Clamp to 0 when below horizon
  };
}
