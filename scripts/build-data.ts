/**
 * Compiles `data/raw/*` into what the app ships: a small eager index and one
 * lazily fetched detail file per route.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { RouteDataset, RouteDetail, RouteIndex, Stop } from '../src/lib/types.ts';
import { NAMTANG_DIR, WIKI_FILE } from './fetch-raw.ts';
import { loadTranslations, type Translations } from './lib/translations.ts';
import { mergeRoutes, type MergeReport } from './merge.ts';
import { parseGtfs, type GtfsFeed } from './sources/gtfs.ts';
import { parseWikipediaRoutes, type WikiParseResult } from './sources/wikipedia.ts';
import { applyTranslations, type TranslationReport } from './translate.ts';

export const DEFAULT_OUTPUT_DIR = 'public/data';

export interface BuildOptions {
  out: string;
  verbose: boolean;
  /** Fail instead of warning when something would show up untranslated. */
  strict: boolean;
}

export interface Sources {
  feed: GtfsFeed;
  wiki: WikiParseResult;
  translations: Translations;
}

export async function loadSources(): Promise<Sources> {
  const wikitext = await readFile(WIKI_FILE, 'utf8');
  const read = (table: string): Promise<string> => readFile(join(NAMTANG_DIR, table), 'utf8');
  const feed = parseGtfs({
    agency: await read('agency.txt'),
    feedInfo: await read('feed_info.txt'),
    routes: await read('routes.txt'),
    trips: await read('trips.txt'),
    stopTimes: await read('stop_times.txt'),
    stops: await read('stops.txt'),
    frequencies: await read('frequencies.txt'),
  });
  return { feed, wiki: parseWikipediaRoutes(wikitext), translations: await loadTranslations() };
}

/** Merge plus translation pass; shared by the build and the extract command. */
export function compile(sources: Sources): { dataset: RouteDataset; report: MergeReport; translation: TranslationReport } {
  const { dataset, report } = mergeRoutes(sources.feed, sources.wiki);
  const translation = applyTranslations(dataset, sources.feed, sources.translations);
  return { dataset, report, translation };
}

export async function buildData(options: BuildOptions): Promise<void> {
  const sources = await loadSources();
  console.log(`Wikipedia: ${sources.wiki.routes.length} rows, ${sources.wiki.reformMapping.size} reform mappings, ${sources.wiki.skipped.length} rows skipped`);
  if (options.verbose) for (const skip of sources.wiki.skipped) console.log(`  skipped line ${skip.line}: ${skip.reason}`);
  console.log(`GTFS ${sources.feed.version}: ${sources.feed.routes.length} Bangkok bus route entries`);

  const { dataset, report, translation } = compile(sources);
  printReport(report, options.verbose);
  console.log(`Translations: ${translation.used.places.size} places, ${translation.used.operators.size} operators and ${translation.used.vehicles.size} vehicle types applied, ${translation.feedResolved.size} places resolved from the feed`);
  const untranslated = warnUntranslated(translation);
  if (untranslated > 0 && options.strict) throw new Error(`${untranslated} untranslated items (see warning above); run "bbc extract-places"`);
  await writeOutput(dataset, options.out);
}

/**
 * Anything still without English will appear as Thai in the English UI.
 * Says exactly what and where, so a data refresh cannot regress silently.
 */
function warnUntranslated(translation: TranslationReport): number {
  const groups: [string, Map<string, string[]>][] = [
    ['place names (card and details)', translation.unresolvedPlaces],
    ['operators (card and details)', translation.unresolvedOperators],
    ['vehicle types (details)', translation.unresolvedVehicles],
  ];
  const total = groups.reduce((sum, [, map]) => sum + map.size, 0);
  if (total === 0) return 0;
  const yellow = (text: string): string => `\u001b[33m${text}\u001b[0m`;
  console.log(yellow(`
WARNING: ${total} items will show in Thai on the English UI. Run "bbc extract-places", translate, rebuild.`));
  for (const [label, map] of groups) {
    if (map.size === 0) continue;
    console.log(yellow(`  ${label}: ${map.size}`));
    for (const [th, routes] of [...map].sort(([a], [b]) => a.localeCompare(b, 'th'))) console.log(`    ${th}  (${routes.slice(0, 4).join(', ')}${routes.length > 4 ? ', …' : ''})`);
  }
  console.log('');
  return total;
}

async function writeOutput(dataset: RouteDataset, outDir: string): Promise<void> {
  const routesDir = join(outDir, 'routes');
  // Start clean so renamed or removed routes do not leave stale detail files.
  await rm(routesDir, { recursive: true, force: true });
  await mkdir(routesDir, { recursive: true });

  const index: RouteIndex = {
    generatedAt: dataset.generatedAt,
    attribution: dataset.attribution,
    routes: dataset.routes.map(({ directions, notes, vehicles, hours, operatorDetail, ...summary }) => ({ ...summary, directionCount: directions.length })),
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
    if (route.hours !== undefined) detail.hours = route.hours;
    if (route.operatorDetail !== undefined) detail.operatorDetail = route.operatorDetail;
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
  console.log(`Routes: ${report.routes} (feed + Wikipedia agree ${report.agree}, conflict ${report.conflict}, feed only ${report.gtfsOnly}, Wikipedia only ${report.wikipediaOnly})`);
  console.log(`  numbers split into several routes: ${report.split.length}`);
  if (verbose) {
    for (const entry of report.split) console.log(`  split ${entry}`);
    for (const entry of report.conflicts) console.log(`  conflict ${entry}`);
  }
}
