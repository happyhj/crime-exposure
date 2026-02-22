import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchCrimes } from '../lib/api.js';
import { crimesToGeoJSON, CATEGORY_COLORS } from '../lib/geojson.js';
import { buildBeatIndex, type BeatIndex } from '../lib/beat-fallback.js';
import { getAvatarPosition, getRouteGeoJSON } from '../lib/avatar-route.js';
import { getSunPosition } from '../lib/sun-position.js';
import { getLightingForHour } from '../lib/lighting.js';
import { CITIES, type CityId } from '../lib/cities.js';
import { TIME_WINDOW } from './TimeSlider.js';

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

interface MapViewProps {
  selectedHour: number;
  selectedCity: CityId;
  onDataLoaded?: () => void;
}

export default function MapView({ selectedHour, selectedCity, onDataLoaded }: MapViewProps) {
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
      addBeatBoundaryLayer(map, cityConfig.beatsPath);
      addBuildingLayer(map);
      addRouteLayer(map, cityConfig.routeCoords);
      addCrimeLayer(map);
      loadCrimeData(map, selectedCity, cityConfig.beatsPath).then(() => onDataLoaded?.());

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
    updateBeatSource(map, cityConfig.beatsPath);

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
    loadCrimeData(map, selectedCity, cityConfig.beatsPath).then(() => onDataLoaded?.());

  }, [selectedCity]);

  // Update time filter and avatar position when selectedHour changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(CRIME_LAYER_ID)) return;

    const fromHour = (selectedHour - TIME_WINDOW + 24) % 24;
    const toHour = (selectedHour + TIME_WINDOW) % 24;

    let filter: maplibregl.FilterSpecification;
    if (fromHour <= toHour) {
      filter = ['all',
        ['>=', ['get', 'occurred_hour'], fromHour],
        ['<=', ['get', 'occurred_hour'], toHour],
      ];
    } else {
      filter = ['any',
        ['>=', ['get', 'occurred_hour'], fromHour],
        ['<=', ['get', 'occurred_hour'], toHour],
      ];
    }

    map.setFilter(CRIME_LAYER_ID, filter);

    // Update avatar position
    if (avatarMarkerRef.current) {
      const cityConfig = CITIES[currentCityRef.current];
      const pos = getAvatarPosition(selectedHour, cityConfig.routeCoords);
      avatarMarkerRef.current.setLngLat(pos);
    }

    // Day/night building color transition
    updateDayNightStyle(map, selectedHour);
  }, [selectedHour]);

  return (
    <div
      ref={mapContainer}
      style={{ width: '100%', height: '100%' }}
    />
  );
}

let hoveredBeatId: string | number | null = null;

function addBeatBoundaryLayer(map: maplibregl.Map, beatsPath: string | null) {
  const emptyCollection = { type: 'FeatureCollection' as const, features: [] };

  map.addSource(BEATS_SOURCE_ID, {
    type: 'geojson',
    data: beatsPath ?? emptyCollection,
    promoteId: 'beat',
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
    const beat = e.features[0].properties.beat;

    if (hoveredBeatId !== null) {
      map.setFeatureState(
        { source: BEATS_SOURCE_ID, id: hoveredBeatId },
        { hover: false },
      );
    }
    hoveredBeatId = beat;
    map.setFeatureState(
      { source: BEATS_SOURCE_ID, id: beat },
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
      .setHTML(`
        <strong>Beat ${props.beat}</strong><br/>
        ${props.first_precinct ? `Precinct: ${props.first_precinct}<br/>` : ''}
        ${props.sector ? `Sector: ${props.sector}` : ''}
      `)
      .addTo(map);
  });
}

function updateBeatSource(map: maplibregl.Map, beatsPath: string | null) {
  const source = map.getSource(BEATS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!source) return;

  if (beatsPath) {
    fetch(beatsPath)
      .then(res => res.json())
      .then(data => source.setData(data))
      .catch(() => source.setData({ type: 'FeatureCollection', features: [] }));
  } else {
    source.setData({ type: 'FeatureCollection', features: [] });
  }
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
    map.setPaintProperty(CRIME_LAYER_ID, 'circle-opacity', lighting.crimeOpacity);
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

async function loadBeatIndex(beatsPath: string | null): Promise<BeatIndex | undefined> {
  if (!beatsPath) return undefined;
  try {
    const res = await fetch(beatsPath);
    if (!res.ok) return undefined;
    const geojson = await res.json();
    return buildBeatIndex(geojson);
  } catch {
    console.warn('Failed to load beat boundaries for coord fallback');
    return undefined;
  }
}

async function loadCrimeData(map: maplibregl.Map, city: CityId, beatsPath: string | null) {
  try {
    const [response, beatIndex] = await Promise.all([
      fetchCrimes({
        city,
        from: '2024-01',
        to: '2024-12',
        limit: 50000,
      }),
      loadBeatIndex(beatsPath),
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
  } catch (err) {
    console.warn(`Failed to load crime data for ${city}:`, err);
  }
}
