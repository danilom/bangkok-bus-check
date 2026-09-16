/**
 * The route map: a Protomaps basemap served from the app's own tiles file,
 * with the route's lines on top. Loaded on demand (this module pulls in
 * MapLibre), so the text app's bundle is unchanged.
 */

import { DARK, LIGHT, layers } from '@protomaps/basemaps';
import type { FeatureCollection } from 'geojson';
import { addProtocol, GeoJSONSource, Map as MapLibreMap, NavigationControl, setWorkerUrl, type LngLatBoundsLike, type StyleSpecification } from 'maplibre-gl';
// MapLibre finds its worker by a computed URL that bundlers cannot follow; Vite bundles it for us via ?worker&url.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol } from 'pmtiles';

import 'maplibre-gl/dist/maplibre-gl.css';

import type { Lang } from '../lib/i18n.ts';
import type { RouteDetail, RouteSummary } from '../lib/types.ts';
import type { Side } from './direction-pill.ts';

export interface RouteMapProps {
  route: RouteSummary;
  detail: RouteDetail;
  side: Side;
  lang: Lang;
  dark: boolean;
  /** The accent colour as a CSS colour string. */
  accent: string;
  /** Absolute URL of the PMTiles file. */
  tilesUrl: string;
}

export interface RouteMap {
  update(props: RouteMapProps): void;
  destroy(): void;
}

const ASSETS = 'https://protomaps.github.io/basemaps-assets';
const ROUTE_SOURCE = 'route';

let protocolRegistered = false;

function registerProtocol(): void {
  if (protocolRegistered) return;
  setWorkerUrl(mapWorkerUrl);
  addProtocol('pmtiles', new Protocol().tile);
  protocolRegistered = true;
}

export function createRouteMap(container: HTMLElement, initial: RouteMapProps): RouteMap {
  registerProtocol();
  let props = initial;
  const map = new MapLibreMap({
    container,
    style: basemapStyle(props),
    attributionControl: { compact: true },
    // The line is what matters; a spinning globe is not.
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

  map.on('error', (event) => console.error('map error', event.error?.message ?? event));
  if (import.meta.env.DEV || location.search.includes('mapdebug')) {
    Object.assign(globalThis, { __bbcMap: map });
    for (const type of ['load', 'idle', 'styledata', 'sourcedata', 'dataloading', 'render'] as const) {
      map.on(type, (event: unknown) => console.debug('bbc map', type, (event as { sourceId?: string }).sourceId ?? '', map.getZoom().toFixed(2), map.isStyleLoaded()));
    }
  }
  let loaded = false;
  map.on('load', () => {
    loaded = true;
    addRouteLayers(map, props);
    fitToRoute(map, props);
  });

  return {
    update(next) {
      const sideChanged = next.side !== props.side;
      const restyle = next.dark !== props.dark || next.lang !== props.lang;
      props = next;
      if (!loaded) return;
      if (restyle) {
        map.setStyle(basemapStyle(props));
        map.once('style.load', () => addRouteLayers(map, props));
        return;
      }
      setRouteData(map, props);
      if (sideChanged) fitToRoute(map, props);
    },
    destroy() {
      map.remove();
    },
  };
}

function basemapStyle(props: RouteMapProps): StyleSpecification {
  const flavor = props.dark ? DARK : LIGHT;
  return {
    version: 8,
    glyphs: `${ASSETS}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${ASSETS}/sprites/v4/${props.dark ? 'dark' : 'light'}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${props.tilesUrl}`,
        attribution: '<a href="https://openstreetmap.org/copyright">© OpenStreetMap</a> · <a href="https://protomaps.com">Protomaps</a>',
      },
    },
    layers: layers('protomaps', flavor, { lang: props.lang }),
  };
}

/** One feature per main run; `selected` marks the direction the page shows. */
function routeFeatures(props: RouteMapProps): FeatureCollection {
  const departsFrom: Side = props.side === 0 ? 1 : 0;
  const runs = props.detail.directions.filter((direction) => !direction.variant && direction.shape);
  return {
    type: 'FeatureCollection',
    features: runs.map((direction) => ({
      type: 'Feature',
      properties: { selected: direction.origin === departsFrom },
      geometry: { type: 'LineString', coordinates: direction.shape ?? [] },
    })),
  };
}

function addRouteLayers(map: MapLibreMap, props: RouteMapProps): void {
  map.addSource(ROUTE_SOURCE, { type: 'geojson', data: routeFeatures(props) });
  map.addLayer({
    id: 'route-other',
    type: 'line',
    source: ROUTE_SOURCE,
    filter: ['!', ['get', 'selected']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': props.dark ? '#9e9e9e' : '#757575', 'line-width': 3, 'line-opacity': 0.5 },
  });
  map.addLayer({
    id: 'route-casing',
    type: 'line',
    source: ROUTE_SOURCE,
    filter: ['get', 'selected'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': props.dark ? '#121212' : '#ffffff', 'line-width': 9, 'line-opacity': 0.9 },
  });
  map.addLayer({
    id: 'route-selected',
    type: 'line',
    source: ROUTE_SOURCE,
    filter: ['get', 'selected'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': props.accent, 'line-width': 5 },
  });
}

function setRouteData(map: MapLibreMap, props: RouteMapProps): void {
  const source = map.getSource(ROUTE_SOURCE);
  if (source instanceof GeoJSONSource) source.setData(routeFeatures(props));
}

function fitToRoute(map: MapLibreMap, props: RouteMapProps): void {
  const selected = routeFeatures(props).features.find((feature) => feature.properties?.['selected'] === true);
  const coordinates = selected?.geometry.type === 'LineString' ? selected.geometry.coordinates : [];
  if (coordinates.length === 0) return;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coordinates as [number, number][]) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  const bounds: LngLatBoundsLike = [[minLon, minLat], [maxLon, maxLat]];
  map.fitBounds(bounds, { padding: 40, duration: 0, maxZoom: 15 });
}
