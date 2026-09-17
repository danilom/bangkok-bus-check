/**
 * The basemap both apps draw on: Protomaps tiles from the site's own
 * PMTiles file, MapLibre with rotation off, the zoom buttons, and the
 * images and helpers the apps' own layers share. This module pulls in
 * MapLibre, so it is only ever imported lazily.
 */

import { DARK, LIGHT, layers } from '@protomaps/basemaps';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { addProtocol, GeoJSONSource, Map as MapLibreMap, NavigationControl, setWorkerUrl, type IControl, type LngLatBoundsLike, type StyleSpecification } from 'maplibre-gl';
// MapLibre finds its worker by a computed URL that bundlers cannot follow; Vite bundles it for us via ?worker&url.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol } from 'pmtiles';

import 'maplibre-gl/dist/maplibre-gl.css';

import { t, type Lang, type StringKey } from '../lib/i18n.ts';
import type { Position } from '../lib/location.ts';

export interface BaseMapProps {
  lang: Lang;
  dark: boolean;
  /** Absolute URL of the PMTiles file. */
  tilesUrl: string;
}

const ASSETS = 'https://protomaps.github.io/basemaps-assets';
export const FONT = ['Noto Sans Regular'];
export const FONT_MEDIUM = ['Noto Sans Medium'];
/** The blue every map app uses for "you are here"; deliberately not the accent, so it reads the same on any theme. */
export const POSITION_BLUE = '#1a73e8';
const POSITION_SOURCE = 'position';

let protocolRegistered = false;

function registerProtocol(): void {
  if (protocolRegistered) return;
  setWorkerUrl(mapWorkerUrl);
  addProtocol('pmtiles', new Protocol().tile);
  protocolRegistered = true;
}

/** A map with the basemap style and zoom buttons; the caller adds its layers on `load`. */
export function createBaseMap(container: HTMLElement, props: BaseMapProps): MapLibreMap {
  registerProtocol();
  const map = new MapLibreMap({
    container,
    style: basemapStyle(props),
    attributionControl: { compact: true },
    // The lines are what matter; a spinning globe is not.
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
  return map;
}

export function basemapStyle(props: BaseMapProps): StyleSpecification {
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

/** Shows or hides layers by id; ids without a layer are ignored. */
export function setLayersVisible(map: MapLibreMap, ids: readonly string[], visible: boolean): void {
  for (const id of ids) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  }
}

/** Pointer cursor over the given layers. */
export function pointerOver(map: MapLibreMap, layerIds: readonly string[]): void {
  for (const layer of layerIds) {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  }
}

export function boundsOf(coordinates: readonly [number, number][]): LngLatBoundsLike | undefined {
  if (coordinates.length === 0) return undefined;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coordinates) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [[minLon, minLat], [maxLon, maxLat]];
}

/** What the button's tooltip calls the labels; Bus Check's stop names by default. */
export interface LabelsWording {
  hide: StringKey;
  show: StringKey;
}

/** A map button under the zoom buttons that shows or hides the labels. */
export class LabelsControl implements IControl {
  private button: HTMLButtonElement | undefined;
  private readonly current: () => { labels: boolean; lang: Lang };
  private readonly onToggle: () => void;
  private readonly wording: LabelsWording;

  constructor(current: () => { labels: boolean; lang: Lang }, onToggle: () => void, wording: LabelsWording = { hide: 'mapLabelsHide', show: 'mapLabelsShow' }) {
    this.current = current;
    this.onToggle = onToggle;
    this.wording = wording;
  }

  onAdd(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'bbc-labels-button';
    this.button.addEventListener('click', () => this.onToggle());
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
    const { labels, lang } = this.current();
    this.button.textContent = 'Aa';
    this.button.classList.toggle('is-off', !labels);
    const label = t(lang, labels ? this.wording.hide : this.wording.show);
    this.button.setAttribute('aria-label', label);
    this.button.title = label;
  }
}

/**
 * The label background: a small card in the app's terms (surface colour,
 * 1px border, rounded), drawn at 2x for crisp corners and stretched to each
 * label; the stretch zones keep the border and corners at their size.
 */
export function addLabelBoxImage(map: MapLibreMap, name: string, dark: boolean, border: string, fill?: string, borderWidth = 1): void {
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
  ctx.lineWidth = borderWidth * scale;
  const inset = (borderWidth * scale) / 2;
  ctx.beginPath();
  ctx.roundRect(inset, inset, size - 2 * inset, size - 2 * inset, radius);
  ctx.fill();
  ctx.stroke();
  map.addImage(name, ctx.getImageData(0, 0, size, size), {
    pixelRatio: scale,
    stretchX: [[radius, size - radius]],
    stretchY: [[radius, size - radius]],
    content: [radius, radius, size - radius, size - radius],
  });
}

function positionFeatures(position: Position | undefined): FeatureCollection<Point> {
  const features: Feature<Point>[] = position ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [position.lon, position.lat] } }] : [];
  return { type: 'FeatureCollection', features };
}

/** The user's position: a soft halo and a solid dot, above whatever was added before. */
export function addPositionLayers(map: MapLibreMap, position: Position | undefined): void {
  map.addSource(POSITION_SOURCE, { type: 'geojson', data: positionFeatures(position) });
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

export function setPositionData(map: MapLibreMap, position: Position | undefined): void {
  const source = map.getSource(POSITION_SOURCE);
  if (source instanceof GeoJSONSource) source.setData(positionFeatures(position));
}
