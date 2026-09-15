/**
 * Merges Wikipedia route rows and OSM directional relations into the app's
 * route dataset. Wikipedia decides which routes exist and gives Thai termini,
 * operator and vehicle info; OSM adds English names, per-direction stops and
 * relation ids for later geometry work.
 *
 * Identity is (route number, operator): the same old number can belong to a
 * BMTA route, a Nonthaburi songthaew and a private minibus at once, and a
 * source that only knows the old number ("73") must still land on the
 * reform-era route ("2-45") when the operator agrees.
 */

import { isZoneNumber, pickPrimaryNumber } from '../src/lib/route-number.ts';
import type { Direction, LocalizedText, Route, RouteDataset, ServiceFlags, Stop } from '../src/lib/types.ts';
import type { OsmRoute } from './sources/osm.ts';
import type { WikiParseResult, WikiRoute } from './sources/wikipedia.ts';

export interface MergeReport {
  routes: number;
  wikiOnly: number;
  osmOnly: number;
  both: number;
  withEnglishTerminals: number;
  withDirections: number;
  withStops: number;
  /** Records re-keyed from an old number to a zone number: "73 → 2-45 (BMTA)". */
  folded: string[];
  /** Records left on their old number because the operator differed. */
  keptApart: string[];
  /** Numbers that resolved to more than one route (different operators). */
  split: string[];
}

/** One source row or relation, normalised enough to group. */
interface Record_ {
  numbers: string[];
  key: string;
  operator: string | undefined;
  from: string | undefined;
  to: string | undefined;
  wiki?: WikiRoute;
  osm?: OsmRoute;
}

interface Bucket {
  /** Route id: the number, suffixed "~2", "~3" when several operators share it. */
  id: string;
  key: string;
  operator: string | undefined;
  records: Record_[];
}

const ATTRIBUTION = [
  'Route list: Thai Wikipedia, "รายการเส้นทางเดินรถโดยสารประจำทางในกรุงเทพมหานครและปริมณฑล" (CC BY-SA 4.0)',
  'Stops and directions: © OpenStreetMap contributors (ODbL)',
];

/** Minimum bigram similarity for two terminus pairs to count as "the same route". */
const SAME_ROUTE_SIMILARITY = 0.5;

export function mergeRoutes(wiki: WikiParseResult, osm: OsmRoute[]): { dataset: RouteDataset; report: MergeReport } {
  const records = [
    ...wiki.routes.map((row) => wikiRecord(row, wiki.reformMapping)),
    ...osm.map(osmRecord),
  ].filter((record): record is Record_ => record !== undefined);

  const report = emptyReport();
  foldOldNumbers(records, report);
  const buckets = bucketByOperator(records, report);

  const stops: Record<string, Stop> = {};
  const routes = buckets.map((bucket) => buildRoute(bucket, stops)).sort((a, b) => compareRouteIds(a.id, b.id));
  fillCounts(routes, report);

  return {
    dataset: { generatedAt: new Date().toISOString(), attribution: ATTRIBUTION, routes, stops },
    report,
  };
}

function wikiRecord(row: WikiRoute, mapping: Map<string, string[]>): Record_ | undefined {
  const mapped = mapping.get(row.number) ?? [];
  const confirmed = row.unconfirmedAliases.filter((alias) => mapped.includes(alias));
  const numbers = unique([row.number, ...row.aliases, ...mapped, ...confirmed]);
  const key = pickPrimaryNumber(numbers);
  if (!key) return undefined;
  return { numbers, key, operator: operatorKey(row.operator), from: row.from, to: row.to, wiki: row };
}

function osmRecord(route: OsmRoute): Record_ | undefined {
  const key = pickPrimaryNumber(route.numbers);
  if (!key) return undefined;
  return {
    numbers: route.numbers,
    key,
    operator: operatorKey(route.operator),
    from: route.from?.th,
    to: route.to?.th,
    osm: route,
  };
}

/**
 * Re-keys records that only know an old number onto the zone number other
 * records pair it with, when the operator matches (or is unknown and the
 * termini look alike).
 */
function foldOldNumbers(records: Record_[], report: MergeReport): void {
  const targetsByOldNumber = new Map<string, Record_[]>();
  for (const record of records) {
    if (!isZoneNumber(record.key)) continue;
    for (const number of record.numbers) {
      if (number === record.key) continue;
      targetsByOldNumber.set(number, [...(targetsByOldNumber.get(number) ?? []), record]);
    }
  }
  for (const record of records) {
    if (isZoneNumber(record.key)) continue;
    const targets = targetsByOldNumber.get(record.key);
    if (!targets) continue;
    const target = targets.find((candidate) => sameRoute(record, candidate));
    if (target) {
      record.key = target.key;
      report.folded.push(`${record.numbers[0]} → ${target.key} (${record.operator ?? '?'})`);
    } else {
      report.keptApart.push(`${record.key} ≠ ${unique(targets.map((t) => t.key)).join('/')} (${record.operator ?? '?'})`);
    }
  }
}

function sameRoute(a: Record_, b: Record_): boolean {
  if (a.operator && b.operator) return a.operator === b.operator;
  return terminiSimilarity(a, b) >= SAME_ROUTE_SIMILARITY;
}

/** Best of forward/backward terminus similarity; 0 when either side lacks termini. */
function terminiSimilarity(a: Record_, b: Record_): number {
  if (!a.from || !a.to || !b.from || !b.to) return 0;
  const forward = (terminusSimilarity(a.from, b.from) + terminusSimilarity(a.to, b.to)) / 2;
  const backward = (terminusSimilarity(a.from, b.to) + terminusSimilarity(a.to, b.from)) / 2;
  return Math.max(forward, backward);
}

/**
 * Within one old-style number, records split by operator. Records with no
 * operator join the bucket whose termini match best, else the only bucket,
 * else their own. Zone numbers are one concession each, so they never split —
 * operator spellings differ between sources ("Bus 33" vs "บจก.บัส 33").
 */
function bucketByOperator(records: Record_[], report: MergeReport): Bucket[] {
  const byKey = new Map<string, Record_[]>();
  for (const record of records) byKey.set(record.key, [...(byKey.get(record.key) ?? []), record]);

  const buckets: Bucket[] = [];
  for (const [key, group] of byKey) {
    if (isZoneNumber(key)) {
      buckets.push({ id: key, key, operator: group.find((r) => r.operator)?.operator, records: group });
      continue;
    }
    const known = group.filter((record) => record.operator !== undefined);
    const unknown = group.filter((record) => record.operator === undefined);
    const keyBuckets: Bucket[] = [];
    for (const record of known) {
      const bucket = keyBuckets.find((candidate) => candidate.operator === record.operator);
      if (bucket) bucket.records.push(record);
      else keyBuckets.push({ id: key, key, operator: record.operator, records: [record] });
    }
    for (const record of unknown) placeUnknown(record, keyBuckets, key);
    keyBuckets.sort((a, b) => b.records.length - a.records.length);
    keyBuckets.forEach((bucket, index) => {
      bucket.id = index === 0 ? key : `${key}~${index + 1}`;
    });
    if (keyBuckets.length > 1) report.split.push(`${key} ×${keyBuckets.length}`);
    buckets.push(...keyBuckets);
  }
  return buckets;
}

function placeUnknown(record: Record_, keyBuckets: Bucket[], key: string): void {
  let best: { bucket: Bucket; score: number } | undefined;
  for (const bucket of keyBuckets) {
    const score = Math.max(...bucket.records.map((other) => terminiSimilarity(record, other)));
    if (!best || score > best.score) best = { bucket, score };
  }
  if (best && (best.score >= SAME_ROUTE_SIMILARITY || keyBuckets.length === 1)) {
    best.bucket.records.push(record);
  } else {
    keyBuckets.push({ id: key, key, operator: undefined, records: [record] });
  }
}

/** Collapses the many spellings of the big operators; other names pass through. */
export function operatorKey(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  if (/ขสมก|bmta|องค์การขนส่งมวลชน/.test(lower)) return 'bmta';
  if (/ไทยสมายล์|thai ?smile|\btsb\b|สมาร์ทบัส|smart ?bus/.test(lower)) return 'tsb';
  return lower.replace(/บจก\.|บมจ\.|บริษัท|จำกัด|\(มหาชน\)|co\.|ltd\.?|\s+/g, '');
}

function buildRoute(bucket: Bucket, stops: Record<string, Stop>): Route {
  const wikiRows = bucket.records.map((record) => record.wiki).filter((row): row is WikiRoute => row !== undefined);
  const osmRoutes = bucket.records.map((record) => record.osm).filter((route): route is OsmRoute => route !== undefined);
  const base = pickBaseRow(wikiRows);
  const numbers = unique(bucket.records.flatMap((record) => record.numbers));
  const directions = osmRoutes.filter((route) => route.from && route.to).map((route) => toDirection(route, stops));

  const route: Route = {
    id: bucket.id,
    number: bucket.key,
    formerNumbers: numbers.filter((number) => number !== bucket.key),
    aliases: [bucket.key, ...numbers.filter((number) => number !== bucket.key)],
    vehicles: unique(wikiRows.flatMap((row) => row.vehicles)),
    service: serviceFlags(bucket.key, wikiRows),
    directions,
    sources: { wikipedia: wikiRows.length > 0, osmRelationIds: osmRoutes.map((r) => r.relationId) },
  };
  const terminals = pickTerminals(base, directions);
  if (terminals) route.terminals = terminals;
  const operator = pickOperator(base?.operator ?? osmRoutes.find((r) => r.operator)?.operator);
  if (operator) route.operator = operator;
  const notes = unique(wikiRows.map((row) => row.notes ?? '').filter((note) => note.length > 0)).join('\n');
  if (notes) route.notes = notes;
  return route;
}

/** Zone-section rows carry the current reform-era description; prefer them. */
function pickBaseRow(rows: WikiRoute[]): WikiRoute | undefined {
  return rows.find((row) => row.category === 'zone') ?? rows.find((row) => row.from && row.to) ?? rows[0];
}

function toDirection(route: OsmRoute, stops: Record<string, Stop>): Direction {
  for (const stop of route.stops) stops[stop.id] ??= stop;
  return {
    from: route.from ?? { th: '' },
    to: route.to ?? { th: '' },
    stops: route.stops.map((stop) => stop.id),
    osmRelationId: route.relationId,
  };
}

/**
 * Wikipedia's Thai termini are the canonical pair. Each side borrows English
 * from whichever OSM terminus (either end of any direction) resembles it most.
 */
function pickTerminals(base: WikiRoute | undefined, directions: Direction[]): [LocalizedText, LocalizedText] | undefined {
  if (!base?.from || !base.to) {
    const first = directions[0];
    return first ? [first.from, first.to] : undefined;
  }
  const endpoints = directions.flatMap((direction) => [direction.from, direction.to]);
  return [localizeTerminus(base.from, endpoints), localizeTerminus(base.to, endpoints)];
}

/** A wrong English name is worse than none, so the match must be convincing. */
const TERMINUS_MATCH_SIMILARITY = 0.5;

function localizeTerminus(th: string, endpoints: LocalizedText[]): LocalizedText {
  let best: { en: string; score: number } | undefined;
  for (const endpoint of endpoints) {
    if (!endpoint.en) continue;
    const score = terminusSimilarity(th, endpoint.th);
    if (!best || score > best.score) best = { en: endpoint.en, score };
  }
  return best && best.score >= TERMINUS_MATCH_SIMILARITY ? { th, en: best.en } : { th };
}

/**
 * Place-name similarity tolerant of the ways sources qualify the same place:
 * "BTS หมอชิต" / "สถานีรถไฟฟ้าหมอชิต", "สถานีรถไฟกรุงเทพ (หัวลำโพง)" / "หัวลำโพง".
 */
export function terminusSimilarity(a: string, b: string): number {
  let best = 0;
  for (const variantA of terminusVariants(a)) {
    for (const variantB of terminusVariants(b)) best = Math.max(best, similarity(variantA, variantB));
  }
  return best;
}

const STATION_PREFIX = /^(?:BTS|MRT|ARL|SRT|สถานีรถไฟฟ้า|สถานี)\s*/i;

function terminusVariants(text: string): string[] {
  const variants = new Set<string>([text]);
  const parenthesised = /\(([^)]*)\)/.exec(text)?.[1]?.trim();
  const withoutParens = text.replace(/\s*\([^)]*\)/g, '').trim();
  if (parenthesised) variants.add(parenthesised);
  if (withoutParens) variants.add(withoutParens);
  for (const variant of [...variants]) {
    const stripped = variant.replace(STATION_PREFIX, '').trim();
    if (stripped) variants.add(stripped);
  }
  return [...variants];
}

/** Sørensen–Dice over character bigrams; tolerant of "สะพานพุทธ" vs "สะพานพระพุทธยอดฟ้า". */
export function similarity(a: string, b: string): number {
  const gramsA = bigrams(a);
  const gramsB = bigrams(b);
  let overlap = 0;
  for (const [gram, count] of gramsA) overlap += Math.min(count, gramsB.get(gram) ?? 0);
  const total = sum(gramsA.values()) + sum(gramsB.values());
  return total === 0 ? 0 : (2 * overlap) / total;
}

function bigrams(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  const compact = text.replace(/\s+/g, '');
  for (let index = 0; index < compact.length - 1; index += 1) {
    const gram = compact.slice(index, index + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

const OPERATOR_NAMES: Record<string, LocalizedText> = {
  bmta: { th: 'ขสมก.', en: 'BMTA' },
  tsb: { th: 'ไทยสมายล์บัส', en: 'Thai Smile Bus' },
};

function pickOperator(name: string | undefined): LocalizedText | undefined {
  if (!name) return undefined;
  const key = operatorKey(name);
  const known = key === undefined ? undefined : OPERATOR_NAMES[key];
  if (!known) return { th: name };
  // Keep Wikipedia's fuller Thai wording ("ให้บริการในนาม ...") when present.
  return /[\u0E00-\u0E7F]/.test(name) ? { th: name, en: known.en ?? '' } : known;
}

function serviceFlags(key: string, rows: WikiRoute[]): ServiceFlags {
  const categories = new Set(rows.map((row) => row.category));
  const notes = rows.map((row) => row.notes ?? '').join('\n');
  return {
    expressway: categories.has('expressway') || /EX?$/.test(key),
    night: categories.has('night'),
    extra: /เส้นทางเสริม|เสริมพิเศษ|รถเสริม/.test(notes) || /X$/.test(key),
    airport: categories.has('airport'),
    suburban: categories.has('suburban') || /^\d{4}/.test(key),
  };
}

function fillCounts(routes: Route[], report: MergeReport): void {
  report.routes = routes.length;
  for (const route of routes) {
    const hasWiki = route.sources.wikipedia;
    const hasOsm = route.sources.osmRelationIds.length > 0;
    if (hasWiki && hasOsm) report.both += 1;
    else if (hasWiki) report.wikiOnly += 1;
    else report.osmOnly += 1;
    if (route.terminals?.[0].en && route.terminals[1].en) report.withEnglishTerminals += 1;
    if (route.directions.length > 0) report.withDirections += 1;
    if (route.directions.some((direction) => direction.stops.length >= 5)) report.withStops += 1;
  }
}

function emptyReport(): MergeReport {
  return {
    routes: 0, wikiOnly: 0, osmOnly: 0, both: 0,
    withEnglishTerminals: 0, withDirections: 0, withStops: 0,
    folded: [], keptApart: [], split: [],
  };
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/** Sorts "1-2" before "1-10", zone numbers before old numbers, letters last. */
function compareRouteIds(a: string, b: string): number {
  const parse = (id: string): [number, number, string] => {
    const match = /^(\d+)(?:-(\d+))?(.*)$/.exec(id);
    if (!match?.[1]) return [Number.MAX_SAFE_INTEGER, 0, id];
    const zone = match[2] === undefined ? Number.MAX_SAFE_INTEGER - 1 : Number.parseInt(match[1], 10);
    const number = Number.parseInt(match[2] ?? match[1], 10);
    return [zone, number, match[3] ?? ''];
  };
  const [zoneA, numberA, suffixA] = parse(a);
  const [zoneB, numberB, suffixB] = parse(b);
  return zoneA - zoneB || numberA - numberB || suffixA.localeCompare(suffixB);
}
