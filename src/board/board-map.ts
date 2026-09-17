/**
 * The board's map: every drawable stop as a dot, the selected stop
 * emphasised, and its fan of legs in their colours with the route numbers
 * along the lines. Loaded on demand (pulls in MapLibre).
 */

import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { GeoJSONSource, type ExpressionSpecification, type Map as MapLibreMap } from 'maplibre-gl';

import { localize, type Lang } from '../lib/i18n.ts';
import type { BoardStop } from '../lib/types.ts';
import { addLabelBoxImage, basemapStyle, boundsOf, createBaseMap, FONT_MEDIUM, LabelsControl, pointerOver, setLayersVisible } from '../ui/base-map.ts';
import type { Strand } from './bundle.ts';
import { fadedLegColour, legColour, type FanLeg } from './fan.ts';
import { STOPS_MINZOOM } from './zoom-hint.ts';

export interface BoardMapProps {
  lang: Lang;
  dark: boolean;
  accent: string;
  tilesUrl: string;
  stops: readonly BoardStop[];
  selected?: BoardStop;
  legs: readonly FanLeg[];
  /** The legs cut into bundles: what is drawn. `legs` carry the labels and the fits. */
  strands: readonly Strand[];
  /** A route singled out from the card: its legs at full strength, the others faded. */
  highlight?: string;
  /** The "Aa" button's state: the route numbers along the lines (more may follow). */
  labels: boolean;
  /** The latest move the app asked for; acted on once, when `seq` changes. Taps never move the map. */
  view?: ViewRequest;
  /** Height of whatever floats over the map's bottom edge (the card), kept clear when fitting. */
  insetBottom: number;
  onSelect: (stop: BoardStop | undefined) => void;
  onHighlight: (routeId: string | undefined) => void;
  onToggleLabels: () => void;
  onZoom: (zoom: number) => void;
}

/**
 * A requested move: the whole fan fitted into view, one route's legs, or
 * back to the stop at street zoom. `seq` tells a new request from a re-render
 * of the old one.
 */
export type ViewMove = { kind: 'fan' } | { kind: 'route'; routeId: string } | { kind: 'stop' };
export type ViewRequest = ViewMove & { seq: number };

export interface BoardMap {
  update(props: BoardMapProps): void;
  destroy(): void;
}

const STOPS_SOURCE = 'board-stops';
const FAN_SOURCE = 'board-fan';
const STRANDS_SOURCE = 'board-strands';
const LABEL_BOX_SELECTED = 'board-label-selected';
const STOP_LAYERS = ['board-stops', 'board-selected'];
const FAN_LAYERS = ['board-fan-line', 'board-fan-faded'];
/** What the "Aa" button hides. */
const LABEL_LAYERS = ['board-fan-labels'];
const BANGKOK: [number, number] = [100.53, 13.75];

/**
 * How the strands are drawn at each zoom: `step` is how far apart neighbours
 * in a bundle sit, `ribbon` the most a whole bundle may span (twenty routes
 * on one avenue make a ribbon, not a motorway), `width` a lone line's width.
 * Citywide the step is tiny and the strands all but overlap; at street zoom
 * the step exceeds the width, so the casing shows between them; close in,
 * everything grows with the roads.
 */
const STRAND_STEPS: [zoom: number, step: number, ribbon: number, width: number][] = [
  [10, 1.5, 12, 4],
  [13, 3, 24, 4],
  [15, 5.5, 44, 5],
  [17, 8.5, 68, 7],
  [20, 15, 120, 12.6],
];

/** The step a bundle's strands sit apart, at one zoom: the nominal step or the ribbon shared out, whichever is less. */
function stepAt(step: number, ribbon: number): ExpressionSpecification {
  return ['min', step, ['/', ribbon, ['max', 1, ['-', ['get', 'count'], 1]]]];
}

/** `['zoom']` may only feed a top-level interpolate, so the zoom steps are the outer expression and the slot arithmetic each output. */
const STRAND_OFFSET: ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  ...STRAND_STEPS.flatMap(([zoom, step, ribbon]) => [zoom, ['*', ['-', ['get', 'slot'], ['/', ['-', ['get', 'count'], 1], 2]], stepAt(step, ribbon)] as ExpressionSpecification]),
];

/**
 * A strand's width: the nominal width times `scale` (faded lines are
 * slimmer), but never wider than the step so neighbours stay apart; a casing
 * is `casing` times the line it backs.
 */
function strandWidth(scale: number, casing = 1): ExpressionSpecification {
  return [
    'interpolate', ['linear'], ['zoom'],
    ...STRAND_STEPS.flatMap(([zoom, step, ribbon, width]) => [zoom, ['*', casing, ['min', width * scale, stepAt(step, ribbon)]] as ExpressionSpecification]),
  ];
}

export function createBoardMap(container: HTMLElement, initial: BoardMapProps): BoardMap {
  let props = initial;
  const map = createBaseMap(container, props);
  map.jumpTo({ center: props.selected ? [props.selected.lon, props.selected.lat] : BANGKOK, zoom: props.selected ? 14.5 : 12 });
  map.on('zoom', () => props.onZoom(map.getZoom()));
  const labelsControl = new LabelsControl(() => props, () => props.onToggleLabels(), { hide: 'boardLabelsHide', show: 'boardLabelsShow' });
  map.addControl(labelsControl, 'top-right');
  // The hint shows the zoom before the style has loaded, so it is reported now, not only on 'load'.
  props.onZoom(map.getZoom());
  wireTaps(map, () => props);
  let loaded = false;
  let viewSeq = 0;
  map.on('load', () => {
    loaded = true;
    addLayers(map, props);
    setLayersVisible(map, LABEL_LAYERS, props.labels);
    // A move asked for while the style was loading is made now.
    applyView();
  });

  function applyView(): void {
    if (!props.view || props.view.seq === viewSeq) return;
    viewSeq = props.view.seq;
    moveTo(map, props, props.view);
  }

  return {
    update(next) {
      const restyle = next.dark !== props.dark || next.lang !== props.lang;
      // 6.7k stop features are rebuilt only when they would differ; the fan is small and always is.
      const stopsChanged = next.stops !== props.stops || next.selected?.id !== props.selected?.id;
      props = next;
      // The button reflects the preference even while the style is still loading.
      labelsControl.refresh();
      if (!loaded) return;
      if (restyle) {
        map.setStyle(basemapStyle(props));
        map.once('style.load', () => {
          addLayers(map, props);
          setLayersVisible(map, LABEL_LAYERS, props.labels);
        });
        return;
      }
      setData(map, props, stopsChanged);
      setLayersVisible(map, LABEL_LAYERS, props.labels);
      applyView();
    },
    destroy() {
      map.remove();
    },
  };
}

function stopFeatures(props: BoardMapProps): FeatureCollection<Point> {
  const features = props.stops.map((stop): Feature<Point> => ({
    type: 'Feature',
    properties: { id: stop.id, name: localize(props.lang, stop.name), routes: stop.routes.length, selected: stop.id === props.selected?.id },
    geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
  }));
  return { type: 'FeatureCollection', features };
}

function fanFeatures(props: BoardMapProps): FeatureCollection<LineString> {
  const features = props.legs.map((leg): Feature<LineString> => ({
    type: 'Feature',
    properties: {
      id: leg.routeId,
      number: leg.route.number,
      colour: legColour(leg.hue, props.dark),
      fadedColour: fadedLegColour(leg.hue, props.dark),
      faded: props.highlight !== undefined && props.highlight !== leg.routeId,
    },
    geometry: { type: 'LineString', coordinates: leg.coordinates },
  }));
  return { type: 'FeatureCollection', features };
}

function strandFeatures(props: BoardMapProps): FeatureCollection<LineString> {
  const features = props.strands.map((strand): Feature<LineString> => ({
    type: 'Feature',
    properties: {
      id: strand.leg.routeId,
      colour: legColour(strand.leg.hue, props.dark),
      fadedColour: fadedLegColour(strand.leg.hue, props.dark),
      faded: props.highlight !== undefined && props.highlight !== strand.leg.routeId,
      slot: strand.slot,
      count: strand.count,
    },
    geometry: { type: 'LineString', coordinates: strand.coordinates },
  }));
  return { type: 'FeatureCollection', features };
}

function addLayers(map: MapLibreMap, props: BoardMapProps): void {
  const surface = props.dark ? '#121212' : '#ffffff';
  addLabelBoxImage(map, LABEL_BOX_SELECTED, props.dark, props.accent, undefined, 2.5);
  map.addSource(FAN_SOURCE, { type: 'geojson', data: fanFeatures(props) });
  map.addSource(STRANDS_SOURCE, { type: 'geojson', data: strandFeatures(props) });
  map.addSource(STOPS_SOURCE, { type: 'geojson', data: stopFeatures(props) });
  // Faded legs first, so the singled-out route's casing sits over them: their own knocked-back colours,
  // opaque, with a thin casing of their own so they float over the roads as drawn lines do.
  map.addLayer({
    id: 'board-fan-faded-casing',
    type: 'line',
    source: STRANDS_SOURCE,
    filter: ['get', 'faded'],
    layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'slot'] },
    paint: { 'line-color': surface, 'line-width': strandWidth(0.75, 5 / 3), 'line-opacity': 0.7, 'line-offset': STRAND_OFFSET },
  });
  map.addLayer({
    id: 'board-fan-faded',
    type: 'line',
    source: STRANDS_SOURCE,
    filter: ['get', 'faded'],
    layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'slot'] },
    paint: { 'line-color': ['get', 'fadedColour'], 'line-width': strandWidth(0.75), 'line-offset': STRAND_OFFSET },
  });
  map.addLayer({
    id: 'board-fan-casing',
    type: 'line',
    source: STRANDS_SOURCE,
    filter: ['!', ['get', 'faded']],
    layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'slot'] },
    paint: { 'line-color': surface, 'line-width': strandWidth(1, 7 / 4), 'line-opacity': 0.8, 'line-offset': STRAND_OFFSET },
  });
  map.addLayer({
    id: 'board-fan-line',
    type: 'line',
    source: STRANDS_SOURCE,
    filter: ['!', ['get', 'faded']],
    layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'slot'] },
    paint: { 'line-color': ['get', 'colour'], 'line-width': strandWidth(1), 'line-offset': STRAND_OFFSET },
  });
  map.addLayer({
    id: 'board-stops',
    type: 'circle',
    source: STOPS_SOURCE,
    filter: ['!', ['get', 'selected']],
    minzoom: STOPS_MINZOOM,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], STOPS_MINZOOM, 3, 16, 6],
      'circle-color': props.accent,
      'circle-stroke-color': surface,
      'circle-stroke-width': 1.5,
      // With a fan up, the other stops step back so the lines read.
      'circle-opacity': props.selected ? 0.45 : 0.9,
      'circle-stroke-opacity': props.selected ? 0.45 : 0.9,
    },
  });
  // The selected stop is grey: the fan is the rainbow, and the dot should belong to none of its colours.
  map.addLayer({
    id: 'board-selected',
    type: 'circle',
    source: STOPS_SOURCE,
    filter: ['get', 'selected'],
    paint: { 'circle-radius': 8, 'circle-color': props.dark ? '#bdbdbd' : '#616161', 'circle-stroke-color': surface, 'circle-stroke-width': 2.5 },
  });
  map.addLayer({
    id: 'board-fan-labels',
    type: 'symbol',
    source: FAN_SOURCE,
    filter: ['!', ['get', 'faded']],
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 220,
      'text-field': ['get', 'number'],
      'text-font': FONT_MEDIUM,
      'text-size': 13,
      'text-rotation-alignment': 'map',
      'text-pitch-alignment': 'viewport',
      'text-keep-upright': true,
    },
    paint: { 'text-color': ['get', 'colour'], 'text-halo-color': surface, 'text-halo-width': 2 },
  });
  // The selected stop's name card: hidden while the card below names the stop anyway; kept for when it is wanted.
  map.addLayer({
    id: 'board-selected-label',
    type: 'symbol',
    source: STOPS_SOURCE,
    filter: ['get', 'selected'],
    layout: {
      visibility: 'none',
      'text-field': ['get', 'name'],
      'text-font': FONT_MEDIUM,
      'text-size': 13.5,
      'text-variable-anchor': ['top', 'bottom', 'right', 'left'],
      'text-radial-offset': 1.6,
      'text-justify': 'auto',
      'text-max-width': 9,
      'text-allow-overlap': true,
      'icon-image': LABEL_BOX_SELECTED,
      'icon-text-fit': 'both',
      'icon-text-fit-padding': [2, 7, 5, 7],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'text-color': props.dark ? '#e0e0e0' : '#212121' },
  });
}

function setData(map: MapLibreMap, props: BoardMapProps, stopsChanged: boolean): void {
  const fan = map.getSource(FAN_SOURCE);
  if (fan instanceof GeoJSONSource) fan.setData(fanFeatures(props));
  const strands = map.getSource(STRANDS_SOURCE);
  if (strands instanceof GeoJSONSource) strands.setData(strandFeatures(props));
  if (!stopsChanged) return;
  const stops = map.getSource(STOPS_SOURCE);
  if (stops instanceof GeoJSONSource) stops.setData(stopFeatures(props));
  for (const property of ['circle-opacity', 'circle-stroke-opacity'] as const) {
    if (map.getLayer('board-stops')) map.setPaintProperty('board-stops', property, props.selected ? 0.45 : 0.9);
  }
}

/** A tap on a stop selects it; on a line, singles out its route; elsewhere, clears the highlight, then the selection. */
function wireTaps(map: MapLibreMap, current: () => BoardMapProps): void {
  map.on('click', (event) => {
    const props = current();
    const stopHit = map.queryRenderedFeatures(pad(event.point, 8), { layers: STOP_LAYERS.filter((id) => map.getLayer(id)) })[0];
    if (stopHit) {
      const id = stopHit.properties['id'];
      props.onSelect(props.stops.find((stop) => stop.id === id));
      return;
    }
    const lineHit = map.queryRenderedFeatures(pad(event.point, 6), { layers: FAN_LAYERS.filter((id) => map.getLayer(id)) })[0];
    if (lineHit) {
      const id = lineHit.properties['id'];
      props.onHighlight(props.highlight === id ? undefined : String(id));
      return;
    }
    if (props.highlight !== undefined) props.onHighlight(undefined);
    else props.onSelect(undefined);
  });
  pointerOver(map, [...STOP_LAYERS, ...FAN_LAYERS]);
}

/** A finger-sized box around a tap, for hitting thin lines. */
function pad(point: { x: number; y: number }, by: number): [[number, number], [number, number]] {
  return [[point.x - by, point.y - by], [point.x + by, point.y + by]];
}

/** Street zoom at the stop: the block around it, the legs' first stretch heading off. */
const STOP_ZOOM = 15;

function moveTo(map: MapLibreMap, props: BoardMapProps, view: ViewMove): void {
  if (view.kind === 'stop') {
    if (props.selected) map.easeTo({ center: [props.selected.lon, props.selected.lat], zoom: STOP_ZOOM, duration: 300 });
    return;
  }
  const legs = view.kind === 'route' ? props.legs.filter((leg) => leg.routeId === view.routeId) : props.legs;
  fitLegs(map, props, legs);
}

/** Fits the legs and the stop into view, the card kept clear, without leaving street zoom behind entirely. */
function fitLegs(map: MapLibreMap, props: BoardMapProps, legs: readonly FanLeg[]): void {
  const coordinates = legs.flatMap((leg) => leg.coordinates);
  if (props.selected) coordinates.push([props.selected.lon, props.selected.lat]);
  const bounds = boundsOf(coordinates);
  if (!bounds) return;
  map.fitBounds(bounds, { padding: { top: 40, bottom: props.insetBottom + 24, left: 40, right: 40 }, duration: 300, maxZoom: 14.5 });
}
