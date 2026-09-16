/**
 * The route map: a Protomaps basemap served from the app's own tiles file,
 * with the route's lines on top. Loaded on demand (this module pulls in
 * MapLibre), so the text app's bundle is unchanged.
 */

import { DARK, LIGHT, layers } from '@protomaps/basemaps';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { addProtocol, GeoJSONSource, Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl, type FilterSpecification, type LngLatBoundsLike, type MapGeoJSONFeature, type StyleSpecification } from 'maplibre-gl';
// MapLibre finds its worker by a computed URL that bundlers cannot follow; Vite bundles it for us via ?worker&url.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol } from 'pmtiles';

import 'maplibre-gl/dist/maplibre-gl.css';

import { localize, t, type Lang } from '../lib/i18n.ts';
import type { Position } from '../lib/location.ts';
import type { Direction, RouteDetail, RouteSummary, Stop } from '../lib/types.ts';
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
  /** The user's position when location is on and known; drawn as a dot, never used to move the view. */
  position?: Position;
}

export interface RouteMap {
  update(props: RouteMapProps): void;
  destroy(): void;
}

const ASSETS = 'https://protomaps.github.io/basemaps-assets';
const ROUTE_SOURCE = 'route';
const STOPS_SOURCE = 'stops';
const POSITION_SOURCE = 'position';
const FONT = ['Noto Sans Regular'];

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
    addStopLayers(map, props);
    addPositionLayers(map, props);
    fitToRoute(map, props);
  });
  wireStopPopups(map, () => props);

  return {
    update(next) {
      const sideChanged = next.side !== props.side;
      const restyle = next.dark !== props.dark || next.lang !== props.lang;
      props = next;
      if (!loaded) return;
      if (restyle) {
        map.setStyle(basemapStyle(props));
        map.once('style.load', () => {
          addRouteLayers(map, props);
          addStopLayers(map, props);
          addPositionLayers(map, props);
        });
        return;
      }
      setRouteData(map, props);
      setStopData(map, props);
      setPositionData(map, props);
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

/** The run the page shows: the one departing from the other terminus. */
function selectedRun(props: RouteMapProps): Direction | undefined {
  const departsFrom: Side = props.side === 0 ? 1 : 0;
  return props.detail.directions.find((direction) => !direction.variant && direction.origin === departsFrom)
    ?? props.detail.directions.find((direction) => direction.origin === departsFrom);
}

/**
 * The selected run's named stops as points. `rank` drives what is drawn:
 * termini and major landmarks get a filled dot and a label at every zoom,
 * ordinary stops a small dot and a label only when zoomed in.
 */
function stopFeatures(props: RouteMapProps): FeatureCollection<Point> {
  const run = selectedRun(props);
  if (!run) return { type: 'FeatureCollection', features: [] };
  const named = run.stops.map((id) => props.detail.stops[id]).filter((stop): stop is Stop => stop !== undefined && stop.name.th.length > 0);
  const features = named.flatMap((stop, index): Feature<Point>[] => {
    if (stop.lon === undefined || stop.lat === undefined) return [];
    const terminus = index === 0 || index === named.length - 1;
    const rank = terminus ? 'terminus' : stop.landmark?.rank === 'major' ? 'major' : 'stop';
    return [{
      type: 'Feature',
      properties: { name: localize(props.lang, stop.name), rank, index: index + 1, total: named.length },
      geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
    }];
  });
  return { type: 'FeatureCollection', features };
}

function addStopLayers(map: MapLibreMap, props: RouteMapProps): void {
  const surface = props.dark ? '#121212' : '#ffffff';
  const text = props.dark ? '#e0e0e0' : '#212121';
  map.addSource(STOPS_SOURCE, { type: 'geojson', data: stopFeatures(props) });
  map.addLayer({
    id: 'stops-dot',
    type: 'circle',
    source: STOPS_SOURCE,
    filter: ['==', ['get', 'rank'], 'stop'],
    minzoom: 11,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2, 14, 4, 16, 6],
      'circle-color': surface,
      'circle-stroke-color': props.accent,
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 14, 2],
    },
  });
  map.addLayer({
    id: 'stops-major',
    type: 'circle',
    source: STOPS_SOURCE,
    filter: ['!=', ['get', 'rank'], 'stop'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 14, 6, 16, 8],
      'circle-color': props.accent,
      'circle-stroke-color': surface,
      'circle-stroke-width': 2,
    },
  });
  // Two label layers rather than a zoom filter: termini and landmarks from zoom 10, the rest once there is room.
  const labelLayers: { id: string; filter: FilterSpecification; minzoom: number }[] = [
    { id: 'stops-label', filter: ['!=', ['get', 'rank'], 'stop'], minzoom: 10 },
    { id: 'stops-label-all', filter: ['==', ['get', 'rank'], 'stop'], minzoom: 14 },
  ];
  for (const { id, filter, minzoom } of labelLayers) map.addLayer({
    id,
    type: 'symbol',
    source: STOPS_SOURCE,
    filter,
    minzoom,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': FONT,
      'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12.5, 15, 15],
      'text-offset': [0, 0.9],
      'text-anchor': 'top',
      'text-max-width': 9,
      'text-optional': true,
      'symbol-sort-key': ['match', ['get', 'rank'], 'terminus', 0, 'major', 1, 2],
    },
    paint: {
      'text-color': text,
      'text-halo-color': surface,
      'text-halo-width': 1.5,
    },
  });
}

function setStopData(map: MapLibreMap, props: RouteMapProps): void {
  const source = map.getSource(STOPS_SOURCE);
  if (source instanceof GeoJSONSource) source.setData(stopFeatures(props));
}

/** Tapping a stop shows its name and place in the run. */
function wireStopPopups(map: MapLibreMap, current: () => RouteMapProps): void {
  const popup = new Popup({ closeButton: false, closeOnClick: true, offset: 10, maxWidth: '260px' });
  const show = (feature: MapGeoJSONFeature): void => {
    if (feature.geometry.type !== 'Point') return;
    const { name, index, total } = feature.properties as { name: string; index: number; total: number };
    const props = current();
    popup.setLngLat(feature.geometry.coordinates as [number, number]).setText(`${name} \u00b7 ${index}/${total} ${t(props.lang, 'stops')}`).addTo(map);
  };
  for (const layer of ['stops-dot', 'stops-major', 'stops-label', 'stops-label-all']) {
    map.on('click', layer, (event) => {
      const feature = event.features?.[0];
      if (feature) show(feature);
    });
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  }
}

function positionFeatures(props: RouteMapProps): FeatureCollection<Point> {
  const { position } = props;
  return {
    type: 'FeatureCollection',
    features: position ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [position.lon, position.lat] } }] : [],
  };
}

/** The blue every map app uses for "you are here"; deliberately not the accent, so it reads the same on any theme. */
const POSITION_BLUE = '#1a73e8';

/** The user's position: a soft halo and a solid dot, above the stops. */
function addPositionLayers(map: MapLibreMap, props: RouteMapProps): void {
  map.addSource(POSITION_SOURCE, { type: 'geojson', data: positionFeatures(props) });
  map.addLayer({
    id: 'position-halo',
    type: 'circle',
    source: POSITION_SOURCE,
    paint: { 'circle-radius': 16, 'circle-color': POSITION_BLUE, 'circle-opacity': 0.2 },
  });
  map.addLayer({
    id: 'position-dot',
    type: 'circle',
    source: POSITION_SOURCE,
    paint: { 'circle-radius': 7, 'circle-color': POSITION_BLUE, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 },
  });
}

function setPositionData(map: MapLibreMap, props: RouteMapProps): void {
  const source = map.getSource(POSITION_SOURCE);
  if (source instanceof GeoJSONSource) source.setData(positionFeatures(props));
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
