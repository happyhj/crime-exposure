import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchCrimes } from '../lib/api.js';
import { crimesToGeoJSON, CATEGORY_COLORS } from '../lib/geojson.js';
import { TIME_WINDOW } from './TimeSlider.js';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? '';

const SEATTLE_CENTER: [number, number] = [-122.3321, 47.6062];
const DEFAULT_ZOOM = 14;
const DEFAULT_PITCH = 60;
const DEFAULT_BEARING = -17;

const CRIME_SOURCE_ID = 'crime-data';
const CRIME_LAYER_ID = 'crime-points';

interface MapViewProps {
  selectedHour: number;
}

export default function MapView({ selectedHour }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: MAPTILER_KEY
        ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
        : 'https://demotiles.maplibre.org/style.json',
      center: SEATTLE_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: DEFAULT_PITCH,
      bearing: DEFAULT_BEARING,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      addBuildingLayer(map);
      addCrimeLayer(map);
      loadCrimeData(map);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update time filter when selectedHour changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(CRIME_LAYER_ID)) return;

    const fromHour = (selectedHour - TIME_WINDOW + 24) % 24;
    const toHour = (selectedHour + TIME_WINDOW) % 24;

    let filter: maplibregl.FilterSpecification;
    if (fromHour <= toHour) {
      // Normal range (e.g., 10-14)
      filter = ['all',
        ['>=', ['get', 'occurred_hour'], fromHour],
        ['<=', ['get', 'occurred_hour'], toHour],
      ];
    } else {
      // Wrapping range (e.g., 22-02)
      filter = ['any',
        ['>=', ['get', 'occurred_hour'], fromHour],
        ['<=', ['get', 'occurred_hour'], toHour],
      ];
    }

    map.setFilter(CRIME_LAYER_ID, filter);

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

  // Click popup
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

function isNightTime(hour: number): boolean {
  return hour < 6 || hour >= 20;
}

function updateDayNightStyle(map: maplibregl.Map, hour: number) {
  const night = isNightTime(hour);

  // Update building color for day/night
  if (map.getLayer('3d-buildings')) {
    map.setPaintProperty('3d-buildings', 'fill-extrusion-color', night ? '#334' : '#aaa');
    map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', night ? 0.8 : 0.6);
  }

  // Update crime point stroke for visibility
  if (map.getLayer(CRIME_LAYER_ID)) {
    map.setPaintProperty(CRIME_LAYER_ID, 'circle-stroke-color', night ? '#333' : '#fff');
    map.setPaintProperty(CRIME_LAYER_ID, 'circle-opacity', night ? 0.85 : 0.7);
  }
}

async function loadCrimeData(map: maplibregl.Map) {
  try {
    const response = await fetchCrimes({
      city: 'seattle',
      from: '2024-01',
      to: '2024-12',
      limit: 50000,
    });

    const geojson = crimesToGeoJSON(response.data);
    const source = map.getSource(CRIME_SOURCE_ID) as maplibregl.GeoJSONSource;
    source.setData(geojson);

    console.log(`Loaded ${response.data.length} crime records (${response.meta.total} total)`);
  } catch (err) {
    console.warn('Failed to load crime data:', err);
  }
}
