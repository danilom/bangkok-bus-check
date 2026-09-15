/**
 * Downloads source snapshots into `data/raw/`. Snapshots are committed so
 * `build-data` is deterministic and does not depend on Overpass being up.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

export const RAW_DIR = 'data/raw';
export const WIKI_FILE = join(RAW_DIR, 'wikipedia-bangkok-routes.wikitext');
export const WIKI_META_FILE = join(RAW_DIR, 'wikipedia-bangkok-routes.meta.json');
export const OSM_FILE = join(RAW_DIR, 'osm-bus-routes.json');

const WIKI_PAGE = 'รายการเส้นทางเดินรถโดยสารประจำทางในกรุงเทพมหานครและปริมณฑล';
const WIKI_API = 'https://th.wikipedia.org/w/api.php';

// Bangkok Metropolitan Region, generous enough for suburban routes.
const BBOX = '13.40,100.25,14.15,101.00';
const OVERPASS_QUERY = `[out:json][timeout:300][maxsize:536870912];
relation["type"="route"]["route"="bus"](${BBOX})->.r;
.r out body;
node(r.r);
out body;`;
const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const USER_AGENT = 'bangkok-bus-check/0.1 (data build script)';

export type RawSource = 'wikipedia' | 'osm';

export async function fetchRaw(sources: RawSource[]): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true });
  for (const source of sources) {
    if (source === 'wikipedia') await fetchWikipedia();
    if (source === 'osm') await fetchOsm();
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

/** Overpass is flaky under load (504s are routine); rotate endpoints and retry. */
async function fetchOsm(attempts = 6): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length] ?? OVERPASS_ENDPOINTS[0];
    if (!endpoint) throw new Error('No Overpass endpoints configured');
    console.log(`Fetching OSM bus routes from ${endpoint} (attempt ${attempt + 1}/${attempts})…`);
    try {
      const text = await fetchOverpass(endpoint);
      await writeFile(OSM_FILE, text, 'utf8');
      console.log(`  ${text.length} bytes → ${OSM_FILE}`);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`  failed: ${error instanceof Error ? error.message : String(error)}`);
      await new Promise((resolve) => setTimeout(resolve, 15_000 * (attempt + 1)));
    }
  }
  throw new Error('Overpass fetch failed after retries', { cause: lastError });
}

async function fetchOverpass(endpoint: string): Promise<string> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'user-agent': USER_AGENT, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: OVERPASS_QUERY }),
    signal: AbortSignal.timeout(400_000),
  });
  if (!response.ok) throw new Error(`Overpass responded ${response.status}`);
  const text = await response.text();
  if (!text.trimStart().startsWith('{')) throw new Error('Overpass returned non-JSON body');
  return text;
}
