/**
 * Compiles `data/raw/*` into what the app ships: a small eager index and one
 * lazily fetched detail file per route.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { RouteDataset, RouteDetail, RouteIndex, Stop } from '../src/lib/types.ts';
import { OSM_FILE, WIKI_FILE } from './fetch-raw.ts';
import { mergeRoutes, type MergeReport } from './merge.ts';
import { overpassSnapshotSchema, parseOsmRoutes } from './sources/osm.ts';
import { parseWikipediaRoutes } from './sources/wikipedia.ts';

export const DEFAULT_OUTPUT_DIR = 'public/data';

export interface BuildOptions {
  out: string;
  verbose: boolean;
}

export async function buildData(options: BuildOptions): Promise<void> {
  const wikitext = await readFile(WIKI_FILE, 'utf8');
  const wiki = parseWikipediaRoutes(wikitext);
  console.log(`Wikipedia: ${wiki.routes.length} rows, ${wiki.reformMapping.size} reform mappings, ${wiki.skipped.length} rows skipped`);
  if (options.verbose) for (const skip of wiki.skipped) console.log(`  skipped line ${skip.line}: ${skip.reason}`);

  const osmJson: unknown = JSON.parse(await readFile(OSM_FILE, 'utf8'));
  const osm = parseOsmRoutes(overpassSnapshotSchema.parse(osmJson));
  console.log(`OSM: ${osm.length} directional relations`);

  const { dataset, report } = mergeRoutes(wiki, osm);
  printReport(report, options.verbose);
  await writeOutput(dataset, options.out);
}

async function writeOutput(dataset: RouteDataset, outDir: string): Promise<void> {
  const routesDir = join(outDir, 'routes');
  // Start clean so renamed or removed routes do not leave stale detail files.
  await rm(routesDir, { recursive: true, force: true });
  await mkdir(routesDir, { recursive: true });

  const index: RouteIndex = {
    generatedAt: dataset.generatedAt,
    attribution: dataset.attribution,
    routes: dataset.routes.map(({ directions, notes, vehicles, ...summary }) => ({ ...summary, directionCount: directions.length })),
  };
  const indexPath = join(outDir, 'index.json');
  await writeFile(indexPath, JSON.stringify(index), 'utf8');

  for (const route of dataset.routes) {
    const detail: RouteDetail = {
      id: route.id,
      directions: route.directions,
      vehicles: route.vehicles,
      stops: pickStops(dataset.stops, route),
    };
    if (route.notes !== undefined) detail.notes = route.notes;
    await writeFile(join(routesDir, `${route.id}.json`), JSON.stringify(detail), 'utf8');
  }
  const indexSize = Buffer.byteLength(JSON.stringify(index));
  console.log(`Wrote ${indexPath} (${(indexSize / 1024).toFixed(0)} KB) and ${dataset.routes.length} detail files in ${routesDir}`);
}

function pickStops(all: Record<string, Stop>, route: RouteDataset['routes'][number]): Record<string, Stop> {
  const picked: Record<string, Stop> = {};
  for (const direction of route.directions) {
    for (const id of direction.stops) {
      const stop = all[id];
      if (stop) picked[id] = stop;
    }
  }
  return picked;
}

function printReport(report: MergeReport, verbose: boolean): void {
  console.log(`Routes: ${report.routes} (both sources ${report.both}, Wikipedia only ${report.wikiOnly}, OSM only ${report.osmOnly})`);
  console.log(`  with English terminals: ${report.withEnglishTerminals}`);
  console.log(`  with directions: ${report.withDirections}, with ≥5 stops: ${report.withStops}`);
  console.log(`  records folded onto zone numbers: ${report.folded.length}, kept apart: ${report.keptApart.length}, numbers split by operator: ${report.split.length}`);
  if (verbose) {
    for (const entry of report.folded) console.log(`  folded ${entry}`);
    for (const entry of report.keptApart) console.log(`  kept apart ${entry}`);
    for (const entry of report.split) console.log(`  split ${entry}`);
  }
}
