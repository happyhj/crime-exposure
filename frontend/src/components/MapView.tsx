import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchCrimes, type CrimeRecord } from '../lib/api.js';
import { crimesToGeoJSON, CATEGORY_COLORS } from '../lib/geojson.js';
import { buildBeatIndex, type BeatIndex } from '../lib/beat-fallback.js';
import { getAvatarPosition, getRouteGeoJSON } from '../lib/avatar-route.js';
import { getSunPosition } from '../lib/sun-position.js';
import { getLightingForHour } from '../lib/lighting.js';
import { CITIES, type CityId } from '../lib/cities.js';
import { TIME_WINDOW } from './TimeSlider.js';
import type { RouteOverlayData } from '../App.js';
import { computeRouteSegments, segmentsToGeoJSON } from '../utils/route-segments.js';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? '';

const DEFAULT_PITCH = 60;
const DEFAULT_BEARING = -17;

const CRIME_SOURCE_ID = 'crime-data';
const CRIME_LAYER_ID = 'crime-points';
const BEATS_SOURCE_ID = 'beat-boundaries';
const BEATS_FILL_LAYER_ID = 'beat-fill';
const BEATS_LINE_LAYER_ID = 'beat-line';
const ROUTE_SOURCE_ID = 'avatar-route';
const ROUTE_LAYER_ID = 'avatar-route-line';
const EXPOSURE_ROUTE_PREFIX = 'exposure-route-';

interface MapViewProps {
  selectedHour: number;
  selectedCity: CityId;
  yearRange: [number, number];
  activeCodes: Set<string> | null; // null = show all
  onDataLoaded?: (records: CrimeRecord[]) => void;
  routeOverlays?: RouteOverlayData[];
}

export default function MapView({ selectedHour, selectedCity, yearRange, activeCodes, onDataLoaded, routeOverlays = [] }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const avatarMarkerRef = useRef<maplibregl.Marker | null>(null);
  const currentCityRef = useRef<CityId>(selectedCity);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const cityConfig = CITIES[selectedCity];
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: MAPTILER_KEY
        ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
        : 'https://demotiles.maplibre.org/style.json',
      center: cityConfig.center,
      zoom: cityConfig.zoom,
      pitch: DEFAULT_PITCH,
      bearing: DEFAULT_BEARING,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      addBeatBoundaryLayer(map, cityConfig.beatsPath, cityConfig.beatKey);
      addBuildingLayer(map);
      addRouteLayer(map, cityConfig.routeCoords);
      addCrimeLayer(map);
      loadCrimeData(map, selectedCity, yearRange, cityConfig.beatsPath, cityConfig.beatKey).then(records => onDataLoaded?.(records));

      // Create avatar marker
      const avatarEl = createAvatarElement();
      const initialPos = getAvatarPosition(12, cityConfig.routeCoords);
      const marker = new maplibregl.Marker({ element: avatarEl })
        .setLngLat(initialPos)
        .addTo(map);
      avatarMarkerRef.current = marker;
    });

    mapRef.current = map;

    return () => {
      avatarMarkerRef.current?.remove();
      avatarMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };

  }, []);

  // Handle city change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;
    if (currentCityRef.current === selectedCity) return;

    currentCityRef.current = selectedCity;
    const cityConfig = CITIES[selectedCity];

    // Fly to new city
    map.flyTo({
      center: cityConfig.center,
      zoom: cityConfig.zoom,
      pitch: DEFAULT_PITCH,
      bearing: DEFAULT_BEARING,
      duration: 2000,
    });

    // Update beat boundaries
    updateBeatSource(map, cityConfig.beatsPath, cityConfig.beatKey);

    // Update route
    const routeSrc = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (routeSrc) {
      routeSrc.setData(getRouteGeoJSON(cityConfig.routeCoords));
    }

    // Update avatar position
    if (avatarMarkerRef.current) {
      const pos = getAvatarPosition(selectedHour, cityConfig.routeCoords);
      avatarMarkerRef.current.setLngLat(pos);
    }

    // Reload crime data
    loadCrimeData(map, selectedCity, yearRange, cityConfig.beatsPath, cityConfig.beatKey).then(records => onDataLoaded?.(records));

  }, [selectedCity]);

  // Handle year range change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;

    const cityConfig = CITIES[currentCityRef.current];
    loadCrimeData(map, currentCityRef.current, yearRange, cityConfig.beatsPath, cityConfig.beatKey).then(records => onDataLoaded?.(records));
  }, [yearRange]);

  // Update time-based opacity, category filter, and avatar position
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(CRIME_LAYER_ID)) return;

    // Code-level filter (null = show all)
    if (activeCodes) {
      const codeFilter: maplibregl.FilterSpecification = [
        'in', ['get', 'nibrs_code'], ['literal', [...activeCodes]],
      ];
      map.setFilter(CRIME_LAYER_ID, codeFilter);
    } else {
      map.setFilter(CRIME_LAYER_ID, null);
    }

    // Time-based opacity: smooth fade based on circular distance from selectedHour
    // circularDist = min(|hour - selected|, 24 - |hour - selected|)
    // opacity = max(0, 1 - circularDist / (TIME_WINDOW + 1))
    const FADE_RANGE = TIME_WINDOW + 1; // fade out over this many hours beyond window
    map.setPaintProperty(CRIME_LAYER_ID, 'circle-opacity', [
      'max', 0,
      ['-', 1,
        ['/',
          ['min',
            ['abs', ['-', ['get', 'occurred_hour'], selectedHour]],
            ['-', 24, ['abs', ['-', ['get', 'occurred_hour'], selectedHour]]],
          ],
          FADE_RANGE,
        ],
      ],
    ]);

    // Radius also scales with proximity
    map.setPaintProperty(CRIME_LAYER_ID, 'circle-radius', [
      'interpolate', ['linear'],
      ['min',
        ['abs', ['-', ['get', 'occurred_hour'], selectedHour]],
        ['-', 24, ['abs', ['-', ['get', 'occurred_hour'], selectedHour]]],
      ],
      0, ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 7],    // at center: larger
      FADE_RANGE, ['interpolate', ['linear'], ['zoom'], 10, 1, 15, 3], // at edge: smaller
    ]);

    // Update avatar position
    if (avatarMarkerRef.current) {
      const cityConfig = CITIES[currentCityRef.current];
      const pos = getAvatarPosition(selectedHour, cityConfig.routeCoords);
      avatarMarkerRef.current.setLngLat(pos);
    }

    // Day/night building color transition
    updateDayNightStyle(map, selectedHour);
  }, [selectedHour, activeCodes]);

  // Render exposure route overlays with crime density coloring
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;

    // Remove existing exposure route layers/sources
    const style = map.getStyle();
    if (style?.layers) {
      for (const layer of style.layers) {
        if (layer.id.startsWith(EXPOSURE_ROUTE_PREFIX)) {
          map.removeLayer(layer.id);
        }
      }
    }
    if (style?.sources) {
      for (const srcId of Object.keys(style.sources)) {
        if (srcId.startsWith(EXPOSURE_ROUTE_PREFIX)) {
          map.removeSource(srcId);
        }
      }
    }

    // Add new exposure route overlays
    for (const overlay of routeOverlays) {
      const sourceId = `${EXPOSURE_ROUTE_PREFIX}${overlay.candidateId}`;
      const layerId = `${EXPOSURE_ROUTE_PREFIX}line-${overlay.candidateId}`;
      const outlineLayerId = `${EXPOSURE_ROUTE_PREFIX}outline-${overlay.candidateId}`;

      const segments = computeRouteSegments(
        overlay.route.coordinates,
        overlay.crimes,
        100,
        200,
      );
      const geojson = segmentsToGeoJSON(segments);

      map.addSource(sourceId, { type: 'geojson', data: geojson });

      // Outline layer (thicker, candidate color)
      map.addLayer({
        id: outlineLayerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': overlay.color,
          'line-width': 8,
          'line-opacity': 0.3,
        },
      });

      // Segment color layer (crime density)
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 4,
          'line-opacity': 0.9,
        },
      });
    }
  }, [routeOverlays]);

  return (
    <div
      ref={mapContainer}
      style={{ width: '100%', height: '100%' }}
    />
  );
}

let hoveredBeatId: string | number | null = null;

function addBeatBoundaryLayer(map: maplibregl.Map, beatsPath: string | null, beatKey: string) {
  const emptyCollection = { type: 'FeatureCollection' as const, features: [] };

  map.addSource(BEATS_SOURCE_ID, {
    type: 'geojson',
    data: beatsPath ?? emptyCollection,
    promoteId: beatKey,
  });

  map.addLayer({
    id: BEATS_FILL_LAYER_ID,
    type: 'fill',
    source: BEATS_SOURCE_ID,
    paint: {
      'fill-color': '#627BC1',
      'fill-opacity': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        0.3,
        0.05,
      ],
    },
  });

  map.addLayer({
    id: BEATS_LINE_LAYER_ID,
    type: 'line',
    source: BEATS_SOURCE_ID,
    paint: {
      'line-color': '#627BC1',
      'line-width': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        2.5,
        1,
      ],
      'line-opacity': 0.6,
    },
  });

  // Hover interaction
  map.on('mousemove', BEATS_FILL_LAYER_ID, (e) => {
    if (!e.features?.length) return;
    const id = e.features[0].properties[beatKey];

    if (hoveredBeatId !== null) {
      map.setFeatureState(
        { source: BEATS_SOURCE_ID, id: hoveredBeatId },
        { hover: false },
      );
    }
    hoveredBeatId = id;
    map.setFeatureState(
      { source: BEATS_SOURCE_ID, id },
      { hover: true },
    );
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', BEATS_FILL_LAYER_ID, () => {
    if (hoveredBeatId !== null) {
      map.setFeatureState(
        { source: BEATS_SOURCE_ID, id: hoveredBeatId },
        { hover: false },
      );
      hoveredBeatId = null;
    }
    map.getCanvas().style.cursor = '';
  });

  map.on('click', BEATS_FILL_LAYER_ID, (e) => {
    if (!e.features?.length) return;
    const props = e.features[0].properties;

    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(formatBeatPopup(props, beatKey))
      .addTo(map);
  });
}

function updateBeatSource(map: maplibregl.Map, beatsPath: string | null, beatKey: string) {
  // Remove existing layers and source, then recreate with new promoteId
  for (const layerId of [BEATS_FILL_LAYER_ID, BEATS_LINE_LAYER_ID]) {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  }
  // Remove click/hover listeners by removing the source
  if (map.getSource(BEATS_SOURCE_ID)) map.removeSource(BEATS_SOURCE_ID);

  hoveredBeatId = null;
  addBeatBoundaryLayer(map, beatsPath, beatKey);
}

function formatBeatPopup(props: Record<string, unknown>, beatKey: string): string {
  const id = props[beatKey] ?? 'Unknown';

  // Seattle
  if (beatKey === 'beat') {
    return `
      <strong>Beat ${id}</strong><br/>
      ${props.first_precinct ? `Precinct: ${props.first_precinct}<br/>` : ''}
      ${props.sector ? `Sector: ${props.sector}` : ''}
    `;
  }

  // Chicago
  if (beatKey === 'BEAT_NUM') {
    return `
      <strong>Beat ${id}</strong><br/>
      ${props.DISTRICT ? `District: ${props.DISTRICT}<br/>` : ''}
      ${props.SECTOR ? `Sector: ${props.SECTOR}` : ''}
    `;
  }

  // LA
  if (beatKey === 'REPDIST') {
    return `
      <strong>District ${id}</strong><br/>
      ${props.APREC ? `Division: ${props.APREC}<br/>` : ''}
      ${props.BUREAU ? `Bureau: ${props.BUREAU}` : ''}
    `;
  }

  return `<strong>Area ${id}</strong>`;
}

function createAvatarElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.style.width = '20px';
  el.style.height = '20px';
  el.style.borderRadius = '50%';
  el.style.background = '#4CAF50';
  el.style.border = '3px solid #fff';
  el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
  el.style.cursor = 'pointer';
  return el;
}

function addRouteLayer(map: maplibregl.Map, routeCoords: [number, number][]) {
  map.addSource(ROUTE_SOURCE_ID, {
    type: 'geojson',
    data: getRouteGeoJSON(routeCoords),
  });

  map.addLayer({
    id: ROUTE_LAYER_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    paint: {
      'line-color': '#4CAF50',
      'line-width': 3,
      'line-opacity': 0.7,
      'line-dasharray': [2, 2],
    },
  });
}

function addBuildingLayer(map: maplibregl.Map) {
  const source = map.getSource('openmaptiles');
  if (!source) return;

  const layers = map.getStyle().layers ?? [];
  const labelLayer = layers.find(l => l.type === 'symbol');

  map.addLayer(
    {
      id: '3d-buildings',
      source: 'openmaptiles',
      'source-layer': 'building',
      type: 'fill-extrusion',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': '#aaa',
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'],
          14, 0,
          14.5, ['get', 'render_height'],
        ],
        'fill-extrusion-base': [
          'interpolate', ['linear'], ['zoom'],
          14, 0,
          14.5, ['get', 'render_min_height'],
        ],
        'fill-extrusion-opacity': 0.6,
      },
    },
    labelLayer?.id,
  );
}

function addCrimeLayer(map: maplibregl.Map) {
  map.addSource(CRIME_SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer({
    id: CRIME_LAYER_ID,
    type: 'circle',
    source: CRIME_SOURCE_ID,
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        10, 2,
        15, 6,
      ],
      'circle-color': [
        'match', ['get', 'nibrs_category'],
        'Violent', CATEGORY_COLORS.Violent,
        'Property', CATEGORY_COLORS.Property,
        'Society', CATEGORY_COLORS.Society,
        CATEGORY_COLORS.Other,
      ],
      'circle-opacity': 0.7,
      'circle-stroke-width': 1,
      'circle-stroke-color': '#fff',
    },
  });

  map.on('click', CRIME_LAYER_ID, (e) => {
    if (!e.features?.length) return;
    const props = e.features[0].properties;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];

    const hour = props.occurred_hour !== null ? `${String(props.occurred_hour).padStart(2, '0')}:00` : 'Unknown';

    new maplibregl.Popup()
      .setLngLat(coords)
      .setHTML(`
        <strong>${props.nibrs_category}</strong><br/>
        Code: ${props.nibrs_code}<br/>
        Date: ${props.occurred_date}<br/>
        Time: ${hour}<br/>
        ${props.neighborhood ? `Area: ${props.neighborhood}` : ''}
      `)
      .addTo(map);
  });

  map.on('mouseenter', CRIME_LAYER_ID, () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', CRIME_LAYER_ID, () => {
    map.getCanvas().style.cursor = '';
  });
}

function updateDayNightStyle(map: maplibregl.Map, hour: number) {
  const lighting = getLightingForHour(hour);

  if (map.getLayer('3d-buildings')) {
    map.setPaintProperty('3d-buildings', 'fill-extrusion-color', lighting.buildingColor);
    map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', lighting.buildingOpacity);
  }

  if (map.getLayer(CRIME_LAYER_ID)) {
    map.setPaintProperty(CRIME_LAYER_ID, 'circle-stroke-color', lighting.crimeStroke);
    // Note: circle-opacity is now data-driven (time-based fade), not set here
  }

  updateSunLight(map, hour, lighting.lightColor);
}

function updateSunLight(map: maplibregl.Map, hour: number, lightColor: string) {
  const sun = getSunPosition(hour);
  const intensity = 0.3 + 0.3 * Math.sin(Math.max(0, sun.altitude / 90) * Math.PI / 2);

  map.setLight({
    anchor: 'map',
    position: [1.5, sun.azimuth, sun.altitude],
    intensity,
    color: lightColor,
  });
}

async function loadBeatIndex(beatsPath: string | null, beatKey: string): Promise<BeatIndex | undefined> {
  if (!beatsPath) return undefined;
  try {
    const res = await fetch(beatsPath);
    if (!res.ok) return undefined;
    const geojson = await res.json();
    return buildBeatIndex(geojson, beatKey);
  } catch {
    console.warn('Failed to load beat boundaries for coord fallback');
    return undefined;
  }
}

async function loadCrimeData(map: maplibregl.Map, city: CityId, yearRange: [number, number], beatsPath: string | null, beatKey: string): Promise<CrimeRecord[]> {
  try {
    const [response, beatIndex] = await Promise.all([
      fetchCrimes({
        city,
        from: `${yearRange[0]}-01`,
        to: `${yearRange[1]}-12`,
        limit: 50000,
      }),
      loadBeatIndex(beatsPath, beatKey),
    ]);

    const geojson = crimesToGeoJSON(response.data, beatIndex);
    const source = map.getSource(CRIME_SOURCE_ID) as maplibregl.GeoJSONSource;
    source.setData(geojson);

    const beatFallbackCount = response.data.filter(
      r => (r.latitude === null || r.longitude === null) && r.district,
    ).length;
    console.log(
      `[${city}] Loaded ${response.data.length} crime records (${response.meta.total} total, ${beatFallbackCount} beat-fallback)`,
    );
    return response.data;
  } catch (err) {
    console.warn(`Failed to load crime data for ${city}:`, err);
    return [];
  }
}
