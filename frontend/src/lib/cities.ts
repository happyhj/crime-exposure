export interface CityConfig {
  name: string;
  center: [number, number];
  zoom: number;
  beatsPath: string | null;
  /** Avatar route waypoints [lng, lat][] */
  routeCoords: [number, number][];
}

export const CITIES: Record<string, CityConfig> = {
  seattle: {
    name: 'Seattle',
    center: [-122.3321, 47.6062],
    zoom: 14,
    beatsPath: '/beats/seattle.geojson',
    routeCoords: [
      [-122.3374, 47.6101],  // Westlake Center
      [-122.3389, 47.6094],  // Pine St
      [-122.3420, 47.6088],  // Pike Place entrance
      [-122.3426, 47.6085],  // Pike Place interior
      [-122.3415, 47.6072],  // 1st Ave south
      [-122.3400, 47.6055],  // Columbia St
      [-122.3385, 47.6040],  // Yesler Way
      [-122.3340, 47.6020],  // Pioneer Square
      [-122.3320, 47.6005],  // King Street Station
    ],
  },
  chicago: {
    name: 'Chicago',
    center: [-87.6298, 41.8781],
    zoom: 13,
    beatsPath: null, // Chicago beats GeoJSON not yet available (P5)
    routeCoords: [
      [-87.6244, 41.8827],   // Millennium Park
      [-87.6256, 41.8819],   // Art Institute
      [-87.6275, 41.8790],   // Grant Park
      [-87.6298, 41.8756],   // Museum Campus
      [-87.6316, 41.8723],   // Soldier Field
      [-87.6340, 41.8700],   // McCormick Place
    ],
  },
  dallas: {
    name: 'Dallas',
    center: [-96.7970, 32.7767],
    zoom: 12,
    beatsPath: null,
    routeCoords: [
      [-96.7969, 32.7811],   // Dallas Arts District
      [-96.7953, 32.7810],   // Klyde Warren Park
      [-96.7970, 32.7797],   // AT&T Discovery District
      [-96.8009, 32.7767],   // Dealey Plaza
      [-96.8070, 32.7733],   // Trinity Groves
      [-96.7945, 32.7817],   // Deep Ellum entrance
    ],
  },
  la: {
    name: 'Los Angeles',
    center: [-118.2437, 34.0522],
    zoom: 12,
    beatsPath: null,
    routeCoords: [
      [-118.2553, 34.0583],  // Grand Park / City Hall
      [-118.2510, 34.0563],  // Little Tokyo
      [-118.2468, 34.0445],  // Arts District
      [-118.2500, 34.0407],  // SCI-Arc
      [-118.2615, 34.0480],  // Pershing Square
      [-118.2680, 34.0510],  // Staples Center area
    ],
  },
  nyc: {
    name: 'New York City',
    center: [-73.9857, 40.7484],
    zoom: 12,
    beatsPath: null,
    routeCoords: [
      [-73.9857, 40.7484],   // Empire State Building
      [-73.9851, 40.7580],   // Times Square
      [-73.9712, 40.7644],   // Central Park South
      [-73.9654, 40.7829],   // Metropolitan Museum
      [-73.9776, 40.7614],   // MoMA
      [-74.0060, 40.7128],   // Wall Street
    ],
  },
};

export const CITY_IDS = Object.keys(CITIES) as Array<keyof typeof CITIES>;
export type CityId = keyof typeof CITIES;
