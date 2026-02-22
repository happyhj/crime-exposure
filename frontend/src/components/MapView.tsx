import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? '';

const SEATTLE_CENTER: [number, number] = [-122.3321, 47.6062];
const DEFAULT_ZOOM = 14;
const DEFAULT_PITCH = 60;
const DEFAULT_BEARING = -17;

export default function MapView() {
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
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div
      ref={mapContainer}
      style={{ width: '100%', height: '100%' }}
    />
  );
}

function addBuildingLayer(map: maplibregl.Map) {
  // MapTiler Streets v2 includes 'building' source layer in 'openmaptiles' source
  const source = map.getSource('openmaptiles');
  if (!source) return; // demo tiles don't have buildings

  const layers = map.getStyle().layers ?? [];
  // Find the first symbol layer to insert buildings below labels
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
          'interpolate',
          ['linear'],
          ['zoom'],
          14, 0,
          14.5, ['get', 'render_height'],
        ],
        'fill-extrusion-base': [
          'interpolate',
          ['linear'],
          ['zoom'],
          14, 0,
          14.5, ['get', 'render_min_height'],
        ],
        'fill-extrusion-opacity': 0.6,
      },
    },
    labelLayer?.id,
  );
}
