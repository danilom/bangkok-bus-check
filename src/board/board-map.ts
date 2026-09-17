/**
 * The board's map: every drawable stop as a dot, the selected stop
 * emphasised, and its fan of legs in their colours with the route numbers
 * along the lines. Loaded on demand (pulls in MapLibre).
 */

import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';

import { localize, type Lang } from '../lib/i18n.ts';
import type { BoardStop } from '../lib/types.ts';
import { addLabelBoxImage, basemapStyle, boundsOf, createBaseMap, FONT_MEDIUM, pointerOver } from '../ui/base-map.ts';
import { legColour, type FanLeg } from './fan.ts';

export interface BoardMapProps {
  lang: Lang;
  dark: boolean;
  accent: string;
  tilesUrl: string;
  stops: readonly BoardStop[];
  selected?: BoardStop;
  legs: readonly FanLeg[];
  /** A route singled out from the card: its legs at full strength, the others faded. */
  highlight?: string;
  /** Changes when the app wants the fan fitted into view; the value itself means nothing. */
  fitRequest: number;
  /** Height of whatever floats over the map's bottom edge (the card), kept clear when fitting. */
  insetBottom: number;
  onSelect: (stop: BoardStop | undefined) => void;
  onHighlight: (routeId: string | undefined) => void;
  onZoom: (zoom: number) => void;
}

export interface BoardMap {
  update(props: BoardMapProps): void;
  destroy(): void;
}

const STOPS_SOURCE = 'board-stops';
const FAN_SOURCE = 'board-fan';
const LABEL_BOX_SELECTED = 'board-label-selected';
/** Dots at neighbourhood zoom and up: 6.7k of them citywide are noise below that. */
export const STOPS_MINZOOM = 13;
const STOP_LAYERS = ['board-stops', 'board-selected'];
const FAN_LAYERS = ['board-fan-line'];
const BANGKOK: [number, number] = [100.53, 13.75];

export function createBoardMap(container: HTMLElement, initial: BoardMapProps): BoardMap {
  let props = initial;
  const map = createBaseMap(container, props);
  map.jumpTo({ center: props.selected ? [props.selected.lon, props.selected.lat] : BANGKOK, zoom: props.selected ? 14.5 : 12 });
  map.on('zoom', () => props.onZoom(map.getZoom()));
  wireTaps(map, () => props);
  let loaded = false;
  map.on('load', () => {
    loaded = true;
    addLayers(map, props);
    // A fan that arrived while the style was loading is fitted now.
    if (props.legs.length > 0) fitToFan(map, props);
    props.onZoom(map.getZoom());
  });

  return {
    update(next) {
      const restyle = next.dark !== props.dark || next.lang !== props.lang;
      // A new fan (a new array, not a re-render of the same one) is fitted into view; a highlight keeps the array.
      const refit = next.fitRequest !== props.fitRequest || (next.legs !== props.legs && next.legs.length > 0);
      // 6.7k stop features are rebuilt only when they would differ; the fan is small and always is.
      const stopsChanged = next.stops !== props.stops || next.selected?.id !== props.selected?.id;
      props = next;
      if (!loaded) return;
      if (restyle) {
        map.setStyle(basemapStyle(props));
        map.once('style.load', () => addLayers(map, props));
        return;
      }
      setData(map, props, stopsChanged);
      if (refit) fitToFan(map, props);
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
      faded: props.highlight !== undefined && props.highlight !== leg.routeId,
    },
    geometry: { type: 'LineString', coordinates: leg.coordinates },
  }));
  return { type: 'FeatureCollection', features };
}

function addLayers(map: MapLibreMap, props: BoardMapProps): void {
  const surface = props.dark ? '#121212' : '#ffffff';
  addLabelBoxImage(map, LABEL_BOX_SELECTED, props.dark, props.accent, undefined, 2.5);
  map.addSource(FAN_SOURCE, { type: 'geojson', data: fanFeatures(props) });
  map.addSource(STOPS_SOURCE, { type: 'geojson', data: stopFeatures(props) });
  map.addLayer({
    id: 'board-fan-casing',
    type: 'line',
    source: FAN_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': surface, 'line-width': 7, 'line-opacity': ['case', ['get', 'faded'], 0.2, 0.8] },
  });
  map.addLayer({
    id: 'board-fan-line',
    type: 'line',
    source: FAN_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'colour'], 'line-width': 4, 'line-opacity': ['case', ['get', 'faded'], 0.25, 1] },
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
  map.addLayer({
    id: 'board-selected',
    type: 'circle',
    source: STOPS_SOURCE,
    filter: ['get', 'selected'],
    paint: { 'circle-radius': 8, 'circle-color': props.accent, 'circle-stroke-color': surface, 'circle-stroke-width': 2.5 },
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
  map.addLayer({
    id: 'board-selected-label',
    type: 'symbol',
    source: STOPS_SOURCE,
    filter: ['get', 'selected'],
    layout: {
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

/** Fits the whole fan, the stop included, without leaving street zoom behind entirely. */
function fitToFan(map: MapLibreMap, props: BoardMapProps): void {
  const coordinates = props.legs.flatMap((leg) => leg.coordinates);
  if (props.selected) coordinates.push([props.selected.lon, props.selected.lat]);
  const bounds = boundsOf(coordinates);
  if (!bounds) return;
  map.fitBounds(bounds, { padding: { top: 40, bottom: props.insetBottom + 24, left: 40, right: 40 }, duration: 300, maxZoom: 14.5 });
}
