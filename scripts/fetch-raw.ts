/**
 * Downloads source snapshots into `data/raw/`. Snapshots are committed so
 * `build-data` is deterministic and works offline.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { listZipEntries, readZipEntry } from './lib/zip.ts';

export const RAW_DIR = 'data/raw';
export const WIKI_FILE = join(RAW_DIR, 'wikipedia-bangkok-routes.wikitext');
export const WIKI_META_FILE = join(RAW_DIR, 'wikipedia-bangkok-routes.meta.json');
export const NAMTANG_DIR = join(RAW_DIR, 'namtang');

const WIKI_PAGE = 'รายการเส้นทางเดินรถโดยสารประจำทางในกรุงเทพมหานครและปริมณฑล';
const WIKI_API = 'https://th.wikipedia.org/w/api.php';

/** Official GTFS feed from the Office of Transport and Traffic Policy and Planning. */
const NAMTANG_GTFS_URL = 'https://namtang-api.otp.go.th/download/namtang-gtfs.zip';
/**
 * Tables the build needs. shapes.txt (150 MB of geometry) and the fare
 * tables (65 MB) are left out until something uses them.
 */
export const NAMTANG_TABLES = ['agency.txt', 'feed_info.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'stops.txt', 'frequencies.txt', 'calendar.txt', 'calendar_dates.txt'] as const;

const USER_AGENT = 'bangkok-bus-check/0.1 (data build script)';

export type RawSource = 'wikipedia' | 'namtang';
export const RAW_SOURCES: readonly RawSource[] = ['wikipedia', 'namtang'];

export async function fetchRaw(sources: readonly RawSource[]): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true });
  for (const source of sources) {
    if (source === 'wikipedia') await fetchWikipedia();
    if (source === 'namtang') await fetchNamtang();
  }
}

const wikiResponseSchema = z.object({
  parse: z.object({
    title: z.string(),
    revid: z.number(),
    wikitext: z.string(),
  }),
});

async function fetchWikipedia(): Promise<void> {
  const url = new URL(WIKI_API);
  url.search = new URLSearchParams({
    action: 'parse',
    page: WIKI_PAGE,
    prop: 'wikitext|revid',
    format: 'json',
    formatversion: '2',
  }).toString();
  console.log(`Fetching Wikipedia page "${WIKI_PAGE}"…`);
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Wikipedia API responded ${response.status}`);
  const body = wikiResponseSchema.parse(await response.json());
  await writeFile(WIKI_FILE, body.parse.wikitext, 'utf8');
  const meta = { title: body.parse.title, revisionId: body.parse.revid, fetchedAt: new Date().toISOString() };
  await writeFile(WIKI_META_FILE, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  console.log(`  revision ${meta.revisionId}, ${body.parse.wikitext.length} chars → ${WIKI_FILE}`);
}

async function fetchNamtang(): Promise<void> {
  console.log(`Fetching Namtang GTFS from ${NAMTANG_GTFS_URL}…`);
  const response = await fetch(NAMTANG_GTFS_URL, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`Namtang responded ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  console.log(`  ${(archive.length / 1024 / 1024).toFixed(1)} MB downloaded`);

  await mkdir(NAMTANG_DIR, { recursive: true });
  const entries = new Map(listZipEntries(archive).map((entry) => [entry.name, entry]));
  for (const table of NAMTANG_TABLES) {
    const entry = entries.get(table);
    if (!entry) throw new Error(`Feed is missing ${table}`);
    const content = readZipEntry(archive, entry);
    await writeFile(join(NAMTANG_DIR, table), content);
    console.log(`  ${table}: ${(content.length / 1024).toFixed(0)} KB`);
  }
  const meta = { source: NAMTANG_GTFS_URL, fetchedAt: new Date().toISOString(), archiveBytes: archive.length };
  await writeFile(join(NAMTANG_DIR, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}
