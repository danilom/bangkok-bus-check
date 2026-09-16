/**
 * The route map: a Protomaps basemap served from the app's own tiles file,
 * with the route's lines on top. Loaded on demand (this module pulls in
 * MapLibre), so the text app's bundle is unchanged.
 */

import { DARK, LIGHT, layers } from '@protomaps/basemaps';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { addProtocol, GeoJSONSource, Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl, type FilterSpecification, type IControl, type LngLatBoundsLike, type StyleSpecification } from 'maplibre-gl';
// MapLibre finds its worker by a computed URL that bundlers cannot follow; Vite bundles it for us via ?worker&url.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol } from 'pmtiles';

import 'maplibre-gl/dist/maplibre-gl.css';

import { localize, t, type Lang } from '../lib/i18n.ts';
import { NEAR_ROUTE_METERS, distanceMeters, nearestStop, type Position } from '../lib/location.ts';
import type { Direction, RouteDetail, RouteSummary, Stop } from '../lib/types.ts';
import type { Side } from './direction-pill.ts';

export interface RouteMapProps {
  route: RouteSummary;
  detail: RouteDetail;
  side: Side;
  lang: Lang;
  dark: boolean;
  /** The accent colour as a CSS colour string, and the soft tint the pill's selected half uses. */
  accent: string;
  accentSoft: string;
  /** Absolute URL of the PMTiles file. */
  tilesUrl: string;
  /** The user's position when location is on and known; drawn as a dot, never used to move the view. */
  position?: Position;
  /** A stop to open on (centred at street zoom, popup shown) instead of fitting the route; from a tap in the list. */
  focusStop?: string;
  /** Stop names shown; the map's own button flips it and the app remembers. */
  labels: boolean;
  onToggleLabels: () => void;
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
const FONT_MEDIUM = ['Noto Sans Medium'];
/** The blue every map app uses for "you are here"; deliberately not the accent, so it reads the same on any theme. */
const POSITION_BLUE = '#1a73e8';

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
  const labelsControl = new LabelsControl(() => props);
  map.addControl(labelsControl, 'top-right');

  map.on('error', (event) => console.error('map error', event.error?.message ?? event));
  if (import.meta.env.DEV || location.search.includes('mapdebug')) {
    Object.assign(globalThis, { __bbcMap: map });
    for (const type of ['load', 'idle', 'styledata', 'sourcedata', 'dataloading', 'render'] as const) {
      map.on(type, (event: unknown) => console.debug('bbc map', type, (event as { sourceId?: string }).sourceId ?? '', map.getZoom().toFixed(2), map.isStyleLoaded()));
    }
  }
  wireStopPopups(map, () => props);
  let loaded = false;
  map.on('load', () => {
    loaded = true;
    addRouteLayers(map, props);
    addArrowLayer(map, props);
    addStopLayers(map, props);
    addLineBlockers(map);
    addPositionLayers(map, props);
    setLabelsVisible(map, props.labels);
    if (!focusStop(map, props)) fitToRoute(map, props);
  });

  return {
    update(next) {
      const sideChanged = next.side !== props.side;
      const restyle = next.dark !== props.dark || next.lang !== props.lang;
      // A position arriving (or going) changes what "ahead" means; a fix moving along the route does not refit.
      const aheadChanged = (aheadFrom(next) === undefined) !== (aheadFrom(props) === undefined);
      const previousFocus = props.focusStop;
      props = next;
      if (!loaded) return;
      if (restyle) {
        map.setStyle(basemapStyle(props));
        map.once('style.load', () => {
          addRouteLayers(map, props);
          addArrowLayer(map, props);
          addStopLayers(map, props);
          addLineBlockers(map);
          addPositionLayers(map, props);
          setLabelsVisible(map, props.labels);
        });
        return;
      }
      setRouteData(map, props);
      setStopData(map, props);
      setPositionData(map, props);
      setLabelsVisible(map, props.labels);
      labelsControl.refresh();
      if (next.focusStop && next.focusStop !== previousFocus) focusStop(map, props);
      else if (sideChanged || aheadChanged) fitToRoute(map, props);
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

/**
 * One feature per main run; `selected` marks the direction the page shows.
 * With the user on the route, the selected run is split at the nearest stop
 * into a `passed` part and the part ahead, like the list's "earlier stops".
 */
function routeFeatures(props: RouteMapProps): FeatureCollection {
  const departsFrom: Side = props.side === 0 ? 1 : 0;
  const runs = props.detail.directions.filter((direction) => !direction.variant && direction.shape);
  const ahead = aheadFrom(props);
  const features: Feature[] = [];
  for (const direction of runs) {
    const selected = direction.origin === departsFrom;
    const shape = direction.shape ?? [];
    const split = selected && ahead ? nearestShapeIndex(shape, ahead.stop) : undefined;
    if (split === undefined) {
      features.push({ type: 'Feature', properties: { selected, passed: false }, geometry: { type: 'LineString', coordinates: shape } });
      continue;
    }
    // Both parts share the split point so the line has no gap.
    features.push({ type: 'Feature', properties: { selected, passed: true }, geometry: { type: 'LineString', coordinates: shape.slice(0, split + 1) } });
    features.push({ type: 'Feature', properties: { selected, passed: false }, geometry: { type: 'LineString', coordinates: shape.slice(split) } });
  }
  return { type: 'FeatureCollection', features };
}

interface Ahead {
  /** Index into the run's named stops of the nearest one. */
  index: number;
  stop: Stop;
}

/** The nearest named stop of the selected run, when the user is close enough to be on the route (same rule as the list). */
function aheadFrom(props: RouteMapProps): Ahead | undefined {
  if (!props.position) return undefined;
  const named = namedStops(props);
  const nearest = nearestStop(named, props.position);
  if (!nearest || nearest.meters > NEAR_ROUTE_METERS) return undefined;
  const stop = named[nearest.index];
  return stop ? { index: nearest.index, stop } : undefined;
}

function namedStops(props: RouteMapProps): Stop[] {
  const run = selectedRun(props);
  if (!run) return [];
  return run.stops.map((id) => props.detail.stops[id]).filter((stop): stop is Stop => stop !== undefined && stop.name.th.length > 0);
}

/** The shape point closest to a stop: the line is cut there. Good to a few metres, which is all the eye needs. */
function nearestShapeIndex(shape: readonly [number, number][], stop: Stop): number | undefined {
  if (stop.lat === undefined || stop.lon === undefined || shape.length === 0) return undefined;
  const target = { lat: stop.lat, lon: stop.lon };
  let best = 0;
  let bestMeters = Infinity;
  shape.forEach(([lon, lat], index) => {
    const meters = distanceMeters(target, { lat, lon });
    if (meters < bestMeters) {
      bestMeters = meters;
      best = index;
    }
  });
  return best;
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
  // The stretch already ridden: the other direction's grey, a little firmer so it still reads as this route.
  map.addLayer({
    id: 'route-passed',
    type: 'line',
    source: ROUTE_SOURCE,
    filter: ['all', ['get', 'selected'], ['get', 'passed']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': props.dark ? '#9e9e9e' : '#757575', 'line-width': 4, 'line-opacity': 0.6 },
  });
  map.addLayer({
    id: 'route-casing',
    type: 'line',
    source: ROUTE_SOURCE,
    filter: AHEAD,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': props.dark ? '#121212' : '#ffffff', 'line-width': 9, 'line-opacity': 0.9 },
  });
  map.addLayer({
    id: 'route-selected',
    type: 'line',
    source: ROUTE_SOURCE,
    filter: AHEAD,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': props.accent, 'line-width': 5 },
  });
}

/** The selected run's part still to come (the whole run when the user is not on it). */
const AHEAD: FilterSpecification = ['all', ['get', 'selected'], ['!', ['get', 'passed']]];

const ARROW = 'route-arrow';

/**
 * Small chevrons along the part of the route ahead, pointing the way the
 * bus goes. Drawn between the stops and the line: the dots sit on top of
 * them, and they yield to labels rather than the other way round.
 */
function addArrowLayer(map: MapLibreMap, props: RouteMapProps): void {
  addArrowImage(map, props.dark);
  map.addLayer({
    id: 'route-arrows',
    type: 'symbol',
    source: ROUTE_SOURCE,
    filter: AHEAD,
    minzoom: 9,
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 9, 90, 14, 140],
      'icon-image': ARROW,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 1.4, 15, 2.2],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': 0.6 },
  });
}

/** A chevron pointing right (the line's direction): white on the dark theme, dark grey on the light one. */
function addArrowImage(map: MapLibreMap, dark: boolean): void {
  if (map.hasImage(ARROW)) map.removeImage(ARROW);
  const scale = 2;
  const size = 12 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // Black at full strength is harsh on the light accents; a dark grey at the layer's 60% reads as a shadow on the line.
  ctx.strokeStyle = dark ? '#ffffff' : '#3a3a3a';
  ctx.lineWidth = 2.6 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(size * 0.32, size * 0.2);
  ctx.lineTo(size * 0.66, size * 0.5);
  ctx.lineTo(size * 0.32, size * 0.8);
  ctx.stroke();
  map.addImage(ARROW, ctx.getImageData(0, 0, size, size), { pixelRatio: scale });
}

const LINE_BLOCKER = 'line-blocker';

/**
 * MapLibre only keeps symbols apart from other symbols, so the line gets a
 * chain of invisible ones: labels that would sit on it are pushed to another
 * anchor or dropped. Added above the label layers so the chain is placed first.
 */
function addLineBlockers(map: MapLibreMap): void {
  if (!map.hasImage(LINE_BLOCKER)) map.addImage(LINE_BLOCKER, { width: 4, height: 4, data: new Uint8Array(4 * 4 * 4) }, { pixelRatio: 1 });
  map.addLayer({
    id: 'route-blockers',
    type: 'symbol',
    source: ROUTE_SOURCE,
    filter: AHEAD,
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 8,
      'icon-image': LINE_BLOCKER,
      'icon-allow-overlap': false,
      'icon-ignore-placement': false,
      'icon-padding': 0,
    },
  });
}

const LABEL_LAYERS = ['stops-label', 'stops-label-all'];

function setLabelsVisible(map: MapLibreMap, visible: boolean): void {
  for (const id of LABEL_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  }
}

/** A map button under the zoom buttons that shows or hides the stop names. */
class LabelsControl implements IControl {
  private button: HTMLButtonElement | undefined;
  private readonly current: () => RouteMapProps;

  constructor(current: () => RouteMapProps) {
    this.current = current;
  }

  onAdd(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'bbc-labels-button';
    this.button.addEventListener('click', () => this.current().onToggleLabels());
    container.append(this.button);
    this.refresh();
    return container;
  }

  onRemove(): void {
    this.button?.parentElement?.remove();
    this.button = undefined;
  }

  refresh(): void {
    if (!this.button) return;
    const props = this.current();
    this.button.textContent = 'Aa';
    this.button.classList.toggle('is-off', !props.labels);
    this.button.setAttribute('aria-label', t(props.lang, props.labels ? 'mapLabelsHide' : 'mapLabelsShow'));
    this.button.title = t(props.lang, props.labels ? 'mapLabelsHide' : 'mapLabelsShow');
  }
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
  const named = namedStops(props);
  const ahead = aheadFrom(props);
  const features = named.flatMap((stop, index): Feature<Point>[] => {
    if (stop.lon === undefined || stop.lat === undefined) return [];
    const terminus = index === 0 || index === named.length - 1;
    const rank = terminus ? 'terminus' : stop.landmark?.rank === 'major' ? 'major' : 'stop';
    return [{
      type: 'Feature',
      properties: {
        id: stop.id,
        name: localize(props.lang, stop.name),
        // The destination's label is styled like the pill's selected half.
        destination: index === named.length - 1,
        rank,
        index: index + 1,
        total: named.length,
        passed: ahead !== undefined && index < ahead.index,
        nearest: ahead !== undefined && index === ahead.index,
        // Nearest to the user, or tapped in the list: drawn large with an emphasised label.
        emphasised: (ahead !== undefined && index === ahead.index) || stop.id === props.focusStop,
      },
      geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
    }];
  });
  return { type: 'FeatureCollection', features };
}

function addStopLayers(map: MapLibreMap, props: RouteMapProps): void {
  const surface = props.dark ? '#121212' : '#ffffff';
  const grey = props.dark ? '#9e9e9e' : '#757575';
  addLabelBoxImage(map, LABEL_BOX, props.dark, props.dark ? '#3a3a3a' : '#d6d6d6');
  addLabelBoxImage(map, LABEL_BOX_NEAREST, props.dark, props.accent);
  addLabelBoxImage(map, LABEL_BOX_DESTINATION, props.dark, props.accent, props.accentSoft);
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
      'circle-stroke-color': ['case', ['get', 'passed'], grey, props.accent],
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
      'circle-color': ['case', ['get', 'passed'], grey, props.accent],
      'circle-stroke-color': surface,
      'circle-stroke-width': 2,
    },
  });
  // The nearest or focused stop: the landmark dot at the position dot's size.
  map.addLayer({
    id: 'stops-nearest',
    type: 'circle',
    source: STOPS_SOURCE,
    filter: ['get', 'emphasised'],
    paint: {
      'circle-radius': 7,
      'circle-color': props.accent,
      'circle-stroke-color': surface,
      'circle-stroke-width': 2.5,
    },
  });
  // Two label layers rather than a zoom filter: termini and landmarks from zoom 10, the rest once there is room.
  const labelLayers: { id: string; filter: FilterSpecification; minzoom: number }[] = [
    // Passed stops keep their dots but lose their labels; the nearest stop is always labelled. The focused stop's label
    // has its own layer, which the names toggle leaves alone.
    { id: 'stops-label', filter: ['all', ['!', ['get', 'passed']], ['!', ['get', 'emphasised']], ['!=', ['get', 'rank'], 'stop']], minzoom: 10 },
    { id: 'stops-label-all', filter: ['all', ['!', ['get', 'passed']], ['!', ['get', 'emphasised']], ['==', ['get', 'rank'], 'stop']], minzoom: 14 },
    { id: 'stops-label-focus', filter: ['get', 'emphasised'], minzoom: 0 },
  ];
  for (const { id, filter, minzoom } of labelLayers) map.addLayer({
    id,
    type: 'symbol',
    source: STOPS_SOURCE,
    filter,
    minzoom,
    layout: {
      'text-field': ['get', 'name'],
      // The nearest stop's label: medium weight on an accent-bordered card.
      'text-font': ['case', ['any', ['get', 'emphasised'], ['get', 'destination']], ['literal', FONT_MEDIUM], ['literal', FONT]],
      // The map page's pill is 0.85rem of a 17px root: the labels match it at every zoom.
      'text-size': 13.5,
      // Tried in this order until one spot is free of other labels and of the line's blockers.
      'text-variable-anchor': ['top', 'bottom', 'right', 'left', 'top-right', 'top-left', 'bottom-right', 'bottom-left'],
      // The emphasised label (nearest or tapped) is the point of the view: it shows even where a plain label would be dropped.
      'text-allow-overlap': id === 'stops-label-focus',
      'text-radial-offset': 1.6,
      'text-justify': 'auto',
      'text-max-width': 9,
      'text-optional': true,
      // A translucent dark box behind the text: a stretched 1-colour image sized to the label.
      'icon-image': ['case', ['get', 'destination'], LABEL_BOX_DESTINATION, ['get', 'emphasised'], LABEL_BOX_NEAREST, LABEL_BOX],
      'icon-text-fit': 'both',
      // The fit already follows the text's offset; an icon offset of its own would double it.
      'icon-text-fit-padding': [3, 7, 4, 7],
      'icon-anchor': 'center',
      'icon-offset': [0, 0],
      // Only the text is collision-tested: the fitted box is evaluated at the anchor, not where the text went.
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': ['case', ['get', 'emphasised'], -1, ['match', ['get', 'rank'], 'terminus', 0, 'major', 1, 2]],
    },
    paint: {
      'text-color': ['case', ['get', 'destination'], props.accent, props.dark ? '#e0e0e0' : '#212121'],
    },
  });
}

const LABEL_BOX = 'label-box';
const LABEL_BOX_NEAREST = 'label-box-nearest';
const LABEL_BOX_DESTINATION = 'label-box-destination';

/**
 * The label background: a small card in the app's terms (surface colour,
 * 1px border, rounded), drawn at 2x for crisp corners and stretched to each
 * label; the stretch zones keep the border and corners at their size.
 */
function addLabelBoxImage(map: MapLibreMap, name: string, dark: boolean, border: string, fill?: string): void {
  if (map.hasImage(name)) map.removeImage(name);
  const scale = 2;
  const radius = 8 * scale;
  const size = radius * 2 + 4 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = fill ?? (dark ? 'rgba(30, 30, 30, 0.6)' : 'rgba(255, 255, 255, 0.6)');
  ctx.strokeStyle = border;
  ctx.lineWidth = scale;
  ctx.beginPath();
  ctx.roundRect(scale / 2, scale / 2, size - scale, size - scale, radius);
  ctx.fill();
  ctx.stroke();
  map.addImage(name, ctx.getImageData(0, 0, size, size), {
    pixelRatio: scale,
    stretchX: [[radius, size - radius]],
    stretchY: [[radius, size - radius]],
    content: [radius, radius, size - radius, size - radius],
  });
}

function setStopData(map: MapLibreMap, props: RouteMapProps): void {
  const source = map.getSource(STOPS_SOURCE);
  if (source instanceof GeoJSONSource) source.setData(stopFeatures(props));
}

/** Centres the map on the focused stop at neighbourhood zoom (a few km of route in view) (its label is emphasised by the layers); false when there is nothing to focus. */
function focusStop(map: MapLibreMap, props: RouteMapProps): boolean {
  if (!props.focusStop) return false;
  const feature = stopFeatures(props).features.find((candidate) => candidate.properties?.['id'] === props.focusStop);
  if (!feature) return false;
  map.jumpTo({ center: feature.geometry.coordinates as [number, number], zoom: 13.5 });
  return true;
}

interface StopFeature {
  geometry: Point;
  properties: { name: string; index: number; total: number };
}

/** Tapping a stop shows its name and place in the run. Returns the function that shows the popup for a stop feature. */
function wireStopPopups(map: MapLibreMap, current: () => RouteMapProps): (feature: StopFeature) => void {
  const popup = new Popup({ closeButton: false, closeOnClick: true, offset: 10, maxWidth: '260px' });
  const show = (feature: StopFeature): void => {
    const { name, index, total } = feature.properties;
    const props = current();
    const content = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = name;
    const position = document.createElement('div');
    position.className = 'map-popup-position';
    position.textContent = t(props.lang, 'stopOfTotal').replace('{i}', String(index)).replace('{n}', String(total));
    content.append(title, position);
    popup.setLngLat(feature.geometry.coordinates as [number, number]).setDOMContent(content).addTo(map);
  };
  for (const layer of ['stops-dot', 'stops-major', 'stops-nearest', 'stops-label', 'stops-label-all', 'stops-label-focus']) {
    map.on('click', layer, (event) => {
      const feature = event.features?.[0];
      if (feature && feature.geometry.type === 'Point') show({ geometry: feature.geometry, properties: feature.properties as StopFeature['properties'] });
    });
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  }
  return show;
}

function positionFeatures(props: RouteMapProps): FeatureCollection<Point> {
  const { position } = props;
  return {
    type: 'FeatureCollection',
    features: position ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [position.lon, position.lat] } }] : [],
  };
}

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

/** Fits the part of the selected run still ahead (the whole run off-route), plus the user's position when on it. */
function fitToRoute(map: MapLibreMap, props: RouteMapProps): void {
  const ahead = routeFeatures(props).features.find((feature) => feature.properties?.['selected'] === true && feature.properties?.['passed'] === false);
  const coordinates = [...(ahead?.geometry.type === 'LineString' ? ahead.geometry.coordinates : [])] as [number, number][];
  if (coordinates.length === 0) return;
  if (props.position && aheadFrom(props)) coordinates.push([props.position.lon, props.position.lat]);
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coordinates) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  const bounds: LngLatBoundsLike = [[minLon, minLat], [maxLon, maxLat]];
  map.fitBounds(bounds, { padding: 40, duration: 0, maxZoom: 15 });
}
