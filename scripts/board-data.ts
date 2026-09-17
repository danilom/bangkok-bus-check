/**
 * The board app's own file: every stop a drawable route serves, with the
 * routes serving it. Geometry is not repeated here — the app fetches the
 * route files Bus Check already ships.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { BoardStop, BoardStops, RouteDataset } from '../src/lib/types.ts';
import { BOARD_TIERS } from './reliability.ts';

export function boardStops(dataset: RouteDataset): BoardStops {
  const byStop = new Map<string, BoardStop>();
  for (const route of dataset.routes) {
    if (route.reliability === undefined || !BOARD_TIERS.includes(route.reliability)) continue;
    for (const direction of route.directions) {
      if (direction.variant) continue;
      for (const id of direction.stops) {
        const stop = dataset.stops[id];
        if (!stop || stop.hailAndRide || stop.lat === undefined || stop.lon === undefined) continue;
        const entry = byStop.get(id) ?? { id, name: stop.name, lat: stop.lat, lon: stop.lon, routes: [] };
        if (!entry.routes.includes(route.id)) entry.routes.push(route.id);
        byStop.set(id, entry);
      }
    }
  }
  return { generatedAt: dataset.generatedAt, stops: [...byStop.values()] };
}

export async function writeBoardData(dataset: RouteDataset, outDir: string): Promise<void> {
  const boardDir = join(outDir, 'board');
  await mkdir(boardDir, { recursive: true });
  const stops = boardStops(dataset);
  const path = join(boardDir, 'stops.json');
  const json = JSON.stringify(stops);
  await writeFile(path, json, 'utf8');
  const routes = new Set(stops.stops.flatMap((stop) => stop.routes));
  console.log(`Wrote ${path} (${(Buffer.byteLength(json) / 1024).toFixed(0)} KB): ${stops.stops.length} stops on ${routes.size} drawable routes`);
}
