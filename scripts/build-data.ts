/** Compiles `data/raw/*` into the dataset the app ships. */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { OSM_FILE, WIKI_FILE } from './fetch-raw.ts';
import { mergeRoutes, type MergeReport } from './merge.ts';
import { overpassSnapshotSchema, parseOsmRoutes } from './sources/osm.ts';
import { parseWikipediaRoutes } from './sources/wikipedia.ts';

export const DEFAULT_OUTPUT = 'public/data/routes.json';

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

  await mkdir(dirname(options.out), { recursive: true });
  await writeFile(options.out, JSON.stringify(dataset), 'utf8');
  const size = Buffer.byteLength(JSON.stringify(dataset));
  console.log(`Wrote ${options.out} (${(size / 1024).toFixed(0)} KB, ${Object.keys(dataset.stops).length} stops)`);
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
