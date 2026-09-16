/**
 * `bbc map <route...>`: draws each route's shapes and stops as an SVG for a
 * look before any map library is involved. Both directions are drawn (the
 * second faint), stops as dots, landmark stops labelled. Files go to
 * `public/dev-maps/` (ignored by git) so the dev server serves them.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Direction, Route, Stop } from '../src/lib/types.ts';
import { compile, loadSources } from './build-data.ts';
import { loadLandmarkRules, tagLandmarks } from './landmarks.ts';
import { pathLength, type LonLat } from './lib/geometry.ts';

export const DEV_MAPS_DIR = 'public/dev-maps';
const WIDTH = 900;
const MARGIN = 30;

export async function reviewMap(ids: string[]): Promise<void> {
  const sources = await loadSources();
  const { dataset } = compile(sources);
  tagLandmarks(dataset, await loadLandmarkRules());
  await mkdir(DEV_MAPS_DIR, { recursive: true });
  for (const id of ids) {
    const route = dataset.routes.find((candidate) => candidate.id === id || candidate.aliases.includes(id));
    if (!route) {
      console.log(`${id}: not found`);
      continue;
    }
    const file = join(DEV_MAPS_DIR, `${route.id}.svg`);
    await writeFile(file, renderSvg(route, dataset.stops), 'utf8');
    for (const direction of route.directions.filter((d) => !d.variant)) {
      const shape = direction.shape ?? [];
      console.log(`${route.id} → ${direction.to.en ?? direction.to.th}: ${shape.length} points, ${(pathLength(shape) / 1000).toFixed(1)} km, ${direction.stops.length} stops`);
    }
    console.log(`  ${file}  (http://localhost:5173/dev-maps/${encodeURIComponent(route.id)}.svg)`);
  }
}

function renderSvg(route: Route, stops: Record<string, Stop>): string {
  const directions = route.directions.filter((d) => !d.variant);
  const points: LonLat[] = directions.flatMap((d) => d.shape ?? []);
  for (const direction of directions) {
    for (const stop of direction.stops.map((id) => stops[id])) {
      if (stop?.lon !== undefined && stop.lat !== undefined) points.push([stop.lon, stop.lat]);
    }
  }
  if (points.length === 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="100"><text x="10" y="50">${route.id}: no geometry</text></svg>`;
  const project = projector(points);
  const height = project.height;
  const lines = directions.map((direction, index) => renderLine(direction, project, index === 0 ? '#7e57c2' : '#9e9e9e', index === 0 ? 3 : 2));
  const dots = directions.flatMap((direction, index) => renderStops(direction, stops, project, index === 0));
  const title = `${route.id}: ${route.terminals?.map((t) => t.en ?? t.th).join(' – ') ?? ''}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="100%" font-family="system-ui, sans-serif" font-size="11">`,
    `<rect width="100%" height="100%" fill="#fafafa"/>`,
    `<text x="${MARGIN}" y="20" font-size="14" font-weight="bold">${escape(title)}</text>`,
    ...lines,
    ...dots,
    '</svg>',
  ].join('\n');
}

interface Projector {
  (point: LonLat): [number, number];
  height: number;
}

/** Equirectangular fit of the bounding box into the SVG width, y down. */
function projector(points: LonLat[]): Projector {
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons), minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const cos = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const spanX = Math.max((maxLon - minLon) * cos, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = (WIDTH - 2 * MARGIN) / spanX;
  const height = Math.round(spanY * scale + 2 * MARGIN + 20);
  const project = ((point: LonLat): [number, number] => [MARGIN + (point[0] - minLon) * cos * scale, 20 + MARGIN + (maxLat - point[1]) * scale]) as Projector;
  project.height = height;
  return project;
}

function renderLine(direction: Direction, project: Projector, colour: string, width: number): string {
  const shape = direction.shape ?? [];
  if (shape.length === 0) return '';
  const d = shape.map((point, i) => `${i === 0 ? 'M' : 'L'}${project(point).map((v) => v.toFixed(1)).join(',')}`).join(' ');
  return `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`;
}

function renderStops(direction: Direction, stops: Record<string, Stop>, project: Projector, labelled: boolean): string[] {
  return direction.stops.flatMap((id, index) => {
    const stop = stops[id];
    if (!stop || stop.lon === undefined || stop.lat === undefined) return [];
    const [x, y] = project([stop.lon, stop.lat]);
    const landmark = stop.landmark?.rank === 'major';
    const parts = [`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${landmark ? 4 : 2.5}" fill="${stop.hailAndRide ? '#bdbdbd' : landmark ? '#d13b2f' : '#212121'}" stroke="#fff" stroke-width="1"/>`];
    if (labelled && (landmark || index === 0 || index === direction.stops.length - 1)) {
      parts.push(`<text x="${(x + 6).toFixed(1)}" y="${(y + 4).toFixed(1)}">${escape(stop.name.en ?? stop.name.th)}</text>`);
    }
    return parts;
  });
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
