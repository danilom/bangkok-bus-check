/**
 * Builds the route dataset from the official GTFS feed, with Wikipedia
 * filling what the feed lacks (old numbers, private operators' names, a few
 * suburban routes, vehicle types, history) and serving as an independent
 * check on the termini.
 *
 * Identity is (route number, operator): the same old number can belong to a
 * BMTA route, a songthaew and a private minibus at once. The feed splits
 * variants (sections, expressway runs, each direction of some lines) into
 * separate route entries; those fold into one route here.
 */

import { isVanNumber, isZoneNumber, pickPrimaryNumber } from '../src/lib/route-number.ts';
import { displayPlace, LOOP_LEFT, LOOP_PREFIX, LOOP_RIGHT, placeVariants, stripLoopMarkers } from './lib/places.ts';
import type { Direction, LocalizedText, LoopSide, Route, RouteDataset, ServiceFlags, SourceAgreement, Stop } from '../src/lib/types.ts';
import type { GtfsFeed, GtfsRoute, GtfsTrip } from './sources/gtfs.ts';
import type { WikiParseResult, WikiRoute } from './sources/wikipedia.ts';

export interface MergeReport {
  routes: number;
  gtfsOnly: number;
  wikipediaOnly: number;
  agree: number;
  conflict: number;
  /** Numbers that resolved to more than one route (different operators or termini). */
  split: string[];
  conflicts: string[];
}

/** One GTFS route entry or one Wikipedia row, normalised enough to group. */
interface Record_ {
  numbers: string[];
  key: string;
  operator: string | undefined;
  from: LocalizedText | undefined;
  to: LocalizedText | undefined;
  gtfs?: GtfsRoute;
  wiki?: WikiRoute;
}

interface Bucket {
  id: string;
  key: string;
  records: Record_[];
}

const ATTRIBUTION = [
  'Routes and stops: Namtang GTFS, สำนักงานนโยบายและแผนการขนส่งและจราจร (OTP), Ministry of Transport (CC BY 4.0)',
  'Operators, former numbers and notes: Thai Wikipedia, "รายการเส้นทางเดินรถโดยสารประจำทางในกรุงเทพมหานครและปริมณฑล" (CC BY-SA 4.0)',
];

/** Minimum name similarity for two termini to count as the same place. */
const SAME_PLACE = 0.5;

export function mergeRoutes(feed: GtfsFeed, wiki: WikiParseResult): { dataset: RouteDataset; report: MergeReport } {
  const records = [
    ...feed.routes.map(gtfsRecord),
    ...wiki.routes.map((row) => wikiRecord(row, wiki.reformMapping)),
  ].filter((record): record is Record_ => record !== undefined);

  const report = emptyReport();
  foldOldNumbers(records);
  const buckets = bucketRecords(records, report);
  const stops: Record<string, Stop> = {};
  const routes = buckets.map((bucket) => buildRoute(bucket, wiki.reformMapping, stops, report)).sort((a, b) => compareRouteIds(a.id, b.id));
  fillCounts(routes, report);

  return {
    dataset: { generatedAt: new Date().toISOString(), attribution: ATTRIBUTION, routes, stops },
    report,
  };
}

function gtfsRecord(route: GtfsRoute): Record_ | undefined {
  const key = pickPrimaryNumber(route.numbers);
  if (!key) return undefined;
  const [from, to] = splitLongName(route.longName);
  return { numbers: route.numbers, key, operator: operatorKey(route.agencyId), from, to, gtfs: route };
}

function wikiRecord(row: WikiRoute, mapping: Map<string, string[]>): Record_ | undefined {
  const mapped = mapping.get(row.number) ?? [];
  const confirmed = row.unconfirmedAliases.filter((alias) => mapped.includes(alias));
  const numbers = unique([row.number, ...row.aliases, ...mapped, ...confirmed]);
  const key = pickPrimaryNumber(numbers);
  if (!key) return undefined;
  return {
    numbers,
    key,
    operator: operatorKey(row.operator),
    from: row.from ? { th: row.from } : undefined,
    to: row.to ? { th: row.to } : undefined,
    wiki: row,
  };
}

/** "บึงกุ่ม - สะพานพุทธ;Buengkum - Saphan Phut" → both ends, both languages. */
export function splitLongName(name: LocalizedText): [LocalizedText, LocalizedText] | [undefined, undefined] {
  const th = splitEnds(name.th);
  if (!th) return [undefined, undefined];
  const en = name.en ? splitEnds(name.en) : undefined;
  return [
    en ? { th: th[0], en: en[0] } : { th: th[0] },
    en ? { th: th[1], en: en[1] } : { th: th[1] },
  ];
}

function splitEnds(text: string): [string, string] | undefined {
  const parts = text.split(/\s+[-–—]\s+/).map((part) => displayPlace(part)).filter(Boolean);
  // "A - B - C" describes a via; keep the ends.
  const first = parts[0];
  const last = parts.at(-1);
  return parts.length >= 2 && first && last ? [first, last] : undefined;
}

/**
 * Collapses the many spellings of the big operators. The feed files every
 * private operator under DLT (the licensing department), which is compatible
 * with any private name Wikipedia gives.
 */
export function operatorKey(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  if (/ขสมก|bmta|องค์การขนส่งมวลชน/.test(lower)) return 'bmta';
  if (/ไทยสมายล์|thai ?smile|\btsb\b|สมาร์ทบัส|smart ?bus/.test(lower)) return 'tsb';
  if (/^กทม\.?$|กรุงเทพมหานคร|^bma$|bangkok metropolitan admin/.test(lower)) return 'bma';
  if (lower === 'dlt') return 'dlt';
  return lower.replace(/บจก\.|บมจ\.|บริษัท|จำกัด|\(มหาชน\)|co\.|ltd\.?|\s+/g, '');
}

const BIG_OPERATORS = new Set(['bmta', 'tsb']);

function operatorsCompatible(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b || a === b) return true;
  if (BIG_OPERATORS.has(a) || BIG_OPERATORS.has(b)) return false;
  return true; // dlt vs a private name, or two private spellings
}

/**
 * A record that only knows an old number ("26") belongs with the zone-number
 * route that lists it as a former number ("1-36 (26)") when the operator is
 * compatible — unless an old-number record of its own exists in the feed,
 * which means the number is genuinely still in use by someone else.
 */
function foldOldNumbers(records: Record_[]): void {
  const zoneByAlias = new Map<string, Record_[]>();
  const isPrimaryStyle = (key: string): boolean => isZoneNumber(key) || /^[A-Z]/.test(key);
  for (const record of records) {
    if (!isPrimaryStyle(record.key)) continue;
    for (const number of record.numbers) {
      if (number !== record.key) zoneByAlias.set(number, [...(zoneByAlias.get(number) ?? []), record]);
    }
  }
  const feedOldKeys = new Set(records.filter((r) => r.gtfs && !isPrimaryStyle(r.key)).map((r) => r.key));
  for (const record of records) {
    if (record.gtfs || isPrimaryStyle(record.key)) continue;
    const targets = zoneByAlias.get(record.key);
    if (!targets) continue;
    const target = targets.find((candidate) => operatorsCompatible(record.operator, candidate.operator));
    if (!target) continue;
    // Both a zone route and a live old-number entry carry this number: keep
    // the row with whichever the termini match, defaulting to the zone route.
    if (feedOldKeys.has(record.key) && record.from && record.to && target.from && target.to && terminiSimilarity(record.from, record.to, target.from, target.to) < SAME_PLACE) continue;
    record.key = target.key;
  }
}

/**
 * Same key, then: zone numbers are one concession each and always merge;
 * old-style numbers merge when the operator is compatible and the termini
 * look alike (or one side has no termini to compare).
 */
function bucketRecords(records: Record_[], report: MergeReport): Bucket[] {
  const byKey = new Map<string, Record_[]>();
  for (const record of records) byKey.set(record.key, [...(byKey.get(record.key) ?? []), record]);

  const buckets: Bucket[] = [];
  for (const [key, group] of byKey) {
    const keyBuckets: Bucket[] = [];
    // GTFS records first so Wikipedia rows attach to them rather than seed buckets.
    const ordered = [...group.filter((r) => r.gtfs), ...group.filter((r) => !r.gtfs)];
    for (const record of ordered) {
      const bucket = isZoneNumber(key) ? keyBuckets[0] : keyBuckets.find((candidate) => candidate.records.some((other) => sameLine(record, other)));
      if (bucket) bucket.records.push(record);
      else keyBuckets.push({ id: key, key, records: [record] });
    }
    keyBuckets.sort((a, b) => b.records.length - a.records.length);
    keyBuckets.forEach((bucket, index) => {
      bucket.id = index === 0 ? key : `${key}~${index + 1}`;
    });
    if (keyBuckets.length > 1) report.split.push(`${key} ×${keyBuckets.length}`);
    buckets.push(...keyBuckets);
  }
  return buckets;
}

function sameLine(a: Record_, b: Record_): boolean {
  if (!operatorsCompatible(a.operator, b.operator)) return false;
  if (a.operator && b.operator && BIG_OPERATORS.has(a.operator) && a.operator === b.operator) return true;
  if (!a.from || !a.to || !b.from || !b.to) return true;
  return terminiSimilarity(a.from, a.to, b.from, b.to) >= SAME_PLACE;
}

function terminiSimilarity(aFrom: LocalizedText, aTo: LocalizedText, bFrom: LocalizedText, bTo: LocalizedText): number {
  const forward = (placeSimilarity(aFrom, bFrom) + placeSimilarity(aTo, bTo)) / 2;
  const backward = (placeSimilarity(aFrom, bTo) + placeSimilarity(aTo, bFrom)) / 2;
  return Math.max(forward, backward);
}

function buildRoute(bucket: Bucket, mapping: Map<string, string[]>, stops: Record<string, Stop>, report: MergeReport): Route {
  const gtfsRoutes = bucket.records.map((r) => r.gtfs).filter((r): r is GtfsRoute => r !== undefined);
  const wikiRows = bucket.records.map((r) => r.wiki).filter((r): r is WikiRoute => r !== undefined);
  const primary = pickPrimaryEntry(gtfsRoutes);
  const wikiBase = pickBaseRow(wikiRows);
  const numbers = unique([...bucket.records.flatMap((r) => r.numbers), ...(mapping.get(bucket.key) ?? [])]);

  const loop = isLoop(primary, wikiBase);
  const rawTerminals = primary ? alignEnglish(splitLongName(primary.longName), gtfsRoutes) : wikiTerminals(wikiBase);
  const terminals = loop ? cleanLoopTerminals(rawTerminals) : rawTerminals;
  const route: Route = {
    id: bucket.id,
    number: bucket.key,
    formerNumbers: numbers.filter((n) => n !== bucket.key),
    aliases: [bucket.key, ...numbers.filter((n) => n !== bucket.key)],
    vehicles: unique(wikiRows.flatMap((row) => row.vehicles)).map((th) => ({ th })),
    service: serviceFlags(bucket.key, gtfsRoutes, wikiRows),
    loop,
    directions: [],
    agreement: agreement(terminals, wikiBase, gtfsRoutes.length > 0),
    sources: { wikipedia: wikiRows.length > 0, gtfsRouteIds: gtfsRoutes.map((r) => r.routeId) },
  };
  if (terminals[0] && terminals[1]) {
    route.terminals = [terminals[0], terminals[1]];
    route.directions = loop ? buildLoopDirections(gtfsRoutes, stops) : buildDirections(gtfsRoutes, primary, route.terminals, stops);
    if (loop) route.sideLabels = loopSideLabels(route.directions);
  }
  const operator = pickOperator(primary, wikiBase);
  if (operator) route.operator = operator.short;
  if (operator?.detail) route.operatorDetail = operator.detail;
  const hours = primary?.hours;
  if (hours) route.hours = hours.start === '00:00' && hours.end >= '23:5' ? '24 h' : `${hours.start}–${hours.end}`;
  const notes = unique(wikiRows.map((row) => row.notes ?? '').filter(Boolean)).join('\n');
  if (notes) route.notes = notes;
  if (route.agreement === 'conflict') {
    report.conflicts.push(`${route.id}: feed "${terminals[0]?.th} – ${terminals[1]?.th}" vs Wikipedia "${wikiBase?.from} – ${wikiBase?.to}"`);
  }
  return route;
}

function isLoop(primary: GtfsRoute | undefined, wikiBase: WikiRoute | undefined): boolean {
  if (primary) return LOOP_PREFIX.test(primary.longName.th) || primary.trips.some((trip) => trip.headsign !== undefined && (LOOP_LEFT.test(trip.headsign.th) || LOOP_RIGHT.test(trip.headsign.th)));
  return wikiBase !== undefined && LOOP_PREFIX.test(wikiBase.from);
}

function cleanLoopTerminals(terminals: [LocalizedText, LocalizedText] | [undefined, undefined]): [LocalizedText, LocalizedText] | [undefined, undefined] {
  const [a, b] = terminals;
  if (!a || !b) return [undefined, undefined];
  const clean = (text: LocalizedText): LocalizedText => {
    const cleaned: LocalizedText = { th: stripLoopMarkers(text.th) };
    if (text.en) cleaned.en = stripLoopMarkers(text.en);
    return cleaned;
  };
  return [clean(a), clean(b)];
}

/**
 * Loop routes: a trip's side is its rotation sense, read from the headsign
 * or the entry's long name (วนซ้าย = 0, วนขวา = 1). Per side, the longest
 * trip is the main run.
 */
function buildLoopDirections(entries: GtfsRoute[], stops: Record<string, Stop>): Direction[] {
  const candidates = dedupeTrips(entries.flatMap((entry) => entry.trips.filter((trip) => trip.stops.length >= 2).map((trip) => ({ entry, trip }))));
  const origins = new Map<string, 0 | 1>();
  for (const { entry, trip } of candidates) {
    // The headsign names this trip's own sense; the entry's long name only
    // says what the entry as a whole was filed under.
    const sense = loopSense(trip.headsign?.th) ?? loopSense(entry.longName.th);
    if (sense !== undefined) origins.set(trip.tripId, sense);
  }
  // A loop with no rotation markers runs one way only: its longest trip is side 0.
  if (origins.size === 0) {
    const longest = [...candidates].sort((a, b) => b.trip.stops.length - a.trip.stops.length)[0];
    if (longest) origins.set(longest.trip.tripId, 0);
  }
  const main = new Map<0 | 1, GtfsTrip>();
  for (const { trip } of candidates) {
    const origin = origins.get(trip.tripId);
    if (origin === undefined) continue;
    const current = main.get(origin);
    if (!current || trip.stops.length > current.stops.length) main.set(origin, trip);
  }
  const mainIds = new Set([...main.values()].map((trip) => trip.tripId));
  const directions: Direction[] = [];
  for (const { trip } of candidates) {
    for (const stop of trip.stops) stops[stop.id] ??= stop;
    directions.push(toDirection(trip, origins.get(trip.tripId), !mainIds.has(trip.tripId)));
  }
  return directions.sort((a, b) => Number(a.variant) - Number(b.variant) || (a.origin ?? 2) - (b.origin ?? 2));
}

function loopSense(text: string | undefined): 0 | 1 | undefined {
  if (!text) return undefined;
  if (LOOP_LEFT.test(text)) return 0;
  if (LOOP_RIGHT.test(text)) return 1;
  return undefined;
}

/** Each side as its sign reads: the headsign's place, and whether the sign says วนซ้าย/วนขวา. */
function loopSideLabels(directions: Direction[]): [LoopSide | null, LoopSide | null] {
  const label = (side: 0 | 1): LoopSide | null => {
    const main = directions.find((direction) => !direction.variant && direction.origin === side);
    const text = main?.headsign ?? main?.to;
    if (!text) return null;
    const name: LocalizedText = { th: stripLoopMarkers(text.th) };
    if (text.en) name.en = stripLoopMarkers(text.en);
    return { name, marked: LOOP_LEFT.test(text.th) || LOOP_RIGHT.test(text.th) };
  };
  return [label(0), label(1)];
}

/**
 * The feed's English long name is occasionally in the opposite order to the
 * Thai. Headsigns are bilingual, so each Thai terminus takes its English
 * from the headsign that names it, when one does.
 */
function alignEnglish(terminals: [LocalizedText, LocalizedText] | [undefined, undefined], entries: GtfsRoute[]): [LocalizedText, LocalizedText] | [undefined, undefined] {
  const [a, b] = terminals;
  if (!a || !b) return terminals;
  const headsigns = entries.flatMap((entry) => entry.trips.map((trip) => trip.headsign)).filter((h): h is LocalizedText => h !== undefined && h.en !== undefined);
  const align = (terminal: LocalizedText): LocalizedText => {
    const match = headsigns.find((headsign) => terminusSimilarity(headsign.th, terminal.th) >= 0.8);
    return match?.en ? { th: terminal.th, en: displayPlace(match.en) } : terminal;
  };
  return [align(a), align(b)];
}

/** The entry with the most stops is the full run; sections and expressway runs are variants. */
function pickPrimaryEntry(entries: GtfsRoute[]): GtfsRoute | undefined {
  return [...entries].sort((a, b) => maxStops(b) - maxStops(a))[0];
}

function maxStops(route: GtfsRoute): number {
  return Math.max(0, ...route.trips.map((trip) => trip.stops.length));
}

/** Zone-section rows carry the current reform-era description; prefer them. */
function pickBaseRow(rows: WikiRoute[]): WikiRoute | undefined {
  return rows.find((row) => row.category === 'zone') ?? rows.find((row) => row.from && row.to) ?? rows[0];
}

function wikiTerminals(row: WikiRoute | undefined): [LocalizedText, LocalizedText] | [undefined, undefined] {
  return row?.from && row.to ? [{ th: row.from }, { th: row.to }] : [undefined, undefined];
}

/**
 * One Direction per trip, deduplicated (the feed repeats runs per service
 * day). The return direction is often a separate route entry in the feed,
 * so main runs are chosen across the whole bucket: per side, the longest
 * trip departing from that terminus. Everything else is a variant.
 */
function buildDirections(entries: GtfsRoute[], primary: GtfsRoute | undefined, terminals: [LocalizedText, LocalizedText], stops: Record<string, Stop>): Direction[] {
  const candidates = dedupeTrips(entries.flatMap((entry) => entry.trips.filter((trip) => trip.stops.length >= 2).map((trip) => ({ entry, trip }))));
  const origins = assignOrigins(candidates, primary, terminals);
  const main = new Map<0 | 1, GtfsTrip>();
  for (const { trip } of candidates) {
    const origin = origins.get(trip.tripId);
    if (origin === undefined) continue;
    const current = main.get(origin);
    if (!current || trip.stops.length > current.stops.length) main.set(origin, trip);
  }
  const mainIds = new Set([...main.values()].map((trip) => trip.tripId));
  const directions: Direction[] = [];
  for (const { trip } of candidates) {
    for (const stop of trip.stops) stops[stop.id] ??= stop;
    directions.push(toDirection(trip, origins.get(trip.tripId), !mainIds.has(trip.tripId)));
  }
  return directions.sort((a, b) => Number(a.variant) - Number(b.variant) || (a.origin ?? 2) - (b.origin ?? 2));
}

interface TripCandidate {
  entry: GtfsRoute;
  trip: GtfsTrip;
}

function dedupeTrips(candidates: TripCandidate[]): TripCandidate[] {
  const seen = new Set<string>();
  return candidates.filter(({ trip }) => {
    const signature = trip.stops.map((stop) => stop.id).join(',');
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

/**
 * How much a trip looks like it runs from terminal `origin` to the other
 * end. The headsign names the destination in the route's own vocabulary and
 * is the strongest signal; an entry whose long name differs from the
 * route's (a return-direction or section entry) names its own ends; the
 * first and last stops are the weakest, being specific places rather than
 * areas.
 */
function endpointScore({ entry, trip }: TripCandidate, origin: 0 | 1, terminals: [LocalizedText, LocalizedText]): number {
  const [from, to] = origin === 0 ? terminals : [terminals[1], terminals[0]];
  let score = 0;
  if (trip.headsign) score += 2 * placeSimilarity(trip.headsign, to);
  const [entryFrom, entryTo] = splitLongName(entry.longName);
  if (entryFrom && entryTo && !samePair([entryFrom, entryTo], terminals)) {
    score += placeSimilarity(entryFrom, from) + placeSimilarity(entryTo, to);
  }
  const [first, last] = namedEnds(trip);
  score += 0.5 * (placeSimilarity(first, from) + placeSimilarity(last, to));
  return score;
}

function samePair(a: [LocalizedText, LocalizedText], b: [LocalizedText, LocalizedText]): boolean {
  return terminiSimilarity(a[0], a[1], b[0], b[1]) >= 0.9;
}

/**
 * Which terminus each trip departs from. Each trip is judged on its own;
 * the primary entry's longest run per direction_id is then judged as a
 * pair (one must be A→B, the other B→A), which settles weakly named ends.
 */
function assignOrigins(candidates: TripCandidate[], primary: GtfsRoute | undefined, terminals: [LocalizedText, LocalizedText]): Map<string, 0 | 1> {
  const origins = new Map<string, 0 | 1>();
  for (const candidate of candidates) {
    const forward = endpointScore(candidate, 0, terminals);
    const backward = endpointScore(candidate, 1, terminals);
    if (Math.max(forward, backward) < SAME_PLACE || Math.abs(forward - backward) < 0.15) continue;
    origins.set(candidate.trip.tripId, forward > backward ? 0 : 1);
  }
  const longest = (directionId: 0 | 1): TripCandidate | undefined =>
    candidates.filter((c) => c.entry === primary && c.trip.directionId === directionId).sort((a, b) => b.trip.stops.length - a.trip.stops.length)[0];
  const out = longest(0);
  const back = longest(1);
  if (out && back) {
    const outIsForward =
      endpointScore(out, 0, terminals) + endpointScore(back, 1, terminals) >= endpointScore(out, 1, terminals) + endpointScore(back, 0, terminals);
    origins.set(out.trip.tripId, outIsForward ? 0 : 1);
    origins.set(back.trip.tripId, outIsForward ? 1 : 0);
  }
  return origins;
}

/** A run's first and last named stops; hail-and-ride points at either end say nothing about where it goes. */
function namedEnds(trip: GtfsTrip): [LocalizedText, LocalizedText] {
  const named = trip.stops.filter((stop) => !stop.hailAndRide);
  return [named[0]?.name ?? { th: '' }, named.at(-1)?.name ?? { th: '' }];
}

function toDirection(trip: GtfsTrip, origin: 0 | 1 | undefined, variant: boolean): Direction {
  const [first, last] = namedEnds(trip);
  const direction: Direction = {
    from: first,
    to: trip.headsign ?? last,
    stops: trip.stops.map((stop) => stop.id),
    tripId: trip.tripId,
    variant,
  };
  if (trip.headsign) direction.headsign = trip.headsign;
  if (origin !== undefined) direction.origin = origin;
  return direction;
}

function agreement(terminals: [LocalizedText, LocalizedText] | [undefined, undefined], wikiBase: WikiRoute | undefined, hasGtfs: boolean): SourceAgreement {
  if (!hasGtfs) return 'wikipedia-only';
  if (!wikiBase?.from || !wikiBase.to || !terminals[0] || !terminals[1]) return 'gtfs-only';
  const similar = terminiSimilarity(terminals[0], terminals[1], { th: wikiBase.from }, { th: wikiBase.to }) >= SAME_PLACE;
  return similar ? 'agree' : 'conflict';
}

export const OPERATOR_NAMES: Record<string, LocalizedText> = {
  bmta: { th: 'ขสมก.', en: 'BMTA' },
  tsb: { th: 'ไทยสมายล์บัส', en: 'Thai Smile Bus' },
  bma: { th: 'กทม.', en: 'BMA' },
};

/** "A (ให้บริการในนาม B)": operator A runs the route under subsidiary B's name. */
export const OPERATING_AS = /^(.*?)\s*\(ให้บริการในนาม\s*([^)]*)\)\s*$/;

/** Wikipedia's generic "private" entry, and the English shown for any private company on the card. */
const PRIVATE_OPERATOR_TH = 'เอกชน';
const PRIVATE_OPERATOR_EN = 'Private operator';

/**
 * Big operators by their short name, whichever source names them; private
 * ones from Wikipedia, since the feed only says "DLT". Wikipedia's full
 * wording ("operating under the name …") is kept for the details page.
 */
function pickOperator(primary: GtfsRoute | undefined, wikiBase: WikiRoute | undefined): { short: LocalizedText; detail?: LocalizedText } | undefined {
  const wikiText = wikiBase?.operator;
  const agencyKey = operatorKey(primary?.agencyId);
  const wikiKey = operatorKey(wikiText);
  // A big operator counts whichever source names it: the feed files some TSB
  // routes under subsidiary agencies, and "DLT" is the licensing department.
  const known = (agencyKey && OPERATOR_NAMES[agencyKey]) ?? (wikiKey && OPERATOR_NAMES[wikiKey]);
  // The full wording is only worth keeping when it names a subsidiary the
  // route is run under; "บจก.ไทยสมายล์บัส" alone is the short name with a prefix.
  const detail = wikiText && OPERATING_AS.test(wikiText) ? { th: wikiText } : undefined;
  if (known) return detail ? { short: known, detail } : { short: known };
  if (wikiText) {
    // Private companies keep their Thai name; the English card says only that
    // it is a private operator, which is all a non-Thai reader can use.
    const short = wikiText.replace(OPERATING_AS, '$1').trim();
    const shortName: LocalizedText = { th: short || PRIVATE_OPERATOR_TH, en: PRIVATE_OPERATOR_EN };
    return short !== wikiText ? { short: shortName, detail: { th: wikiText } } : { short: shortName };
  }
  if (primary && agencyKey !== 'dlt') return { short: englishOrPrivate(primary.agencyName) };
  return undefined;
}

/** A feed agency name whose "English" half is still Thai gets the generic English. */
function englishOrPrivate(name: LocalizedText): LocalizedText {
  const en = name.en && !/[ก-๛]/.test(name.en) ? name.en : PRIVATE_OPERATOR_EN;
  return { th: name.th, en };
}

function serviceFlags(key: string, entries: GtfsRoute[], rows: WikiRoute[]): ServiceFlags {
  const longNames = entries.map((entry) => entry.longName.th).join('\n');
  const notes = rows.map((row) => row.notes ?? '').join('\n');
  const categories = new Set(rows.map((row) => row.category));
  return {
    expressway: /EX?$/.test(key) || /ทางด่วน/.test(longNames) || categories.has('expressway'),
    night: entries.some((entry) => entry.night) || categories.has('night'),
    extra: /X$/.test(key) || /เส้นทางเสริม|เสริมพิเศษ/.test(notes),
    airport: /^[AS]\d/.test(key) || /ท่าอากาศยาน|สนามบิน/.test(longNames) || categories.has('airport'),
    suburban: /^\d{4}/.test(key) || categories.has('suburban'),
    van: isVanNumber(key),
  };
}

/**
 * Place-name similarity tolerant of the ways sources qualify the same place:
 * "BTS หมอชิต" / "สถานีรถไฟฟ้าหมอชิต", "สถานีรถไฟกรุงเทพ (หัวลำโพง)" / "หัวลำโพง".
 * Compares in either language when both sides have it.
 */
export function placeSimilarity(a: LocalizedText, b: LocalizedText): number {
  let best = terminusSimilarity(a.th, b.th);
  if (a.en && b.en) best = Math.max(best, terminusSimilarity(a.en, b.en));
  return best;
}

export function terminusSimilarity(a: string, b: string): number {
  let best = 0;
  for (const variantA of placeVariants(a)) {
    for (const variantB of placeVariants(b)) best = Math.max(best, similarity(variantA, variantB));
  }
  return best;
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
  const compact = text.replace(/\s+/g, '').toLowerCase();
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

function fillCounts(routes: Route[], report: MergeReport): void {
  report.routes = routes.length;
  for (const route of routes) {
    if (route.agreement === 'gtfs-only') report.gtfsOnly += 1;
    if (route.agreement === 'wikipedia-only') report.wikipediaOnly += 1;
    if (route.agreement === 'agree') report.agree += 1;
    if (route.agreement === 'conflict') report.conflict += 1;
  }
}

function emptyReport(): MergeReport {
  return { routes: 0, gtfsOnly: 0, wikipediaOnly: 0, agree: 0, conflict: 0, split: [], conflicts: [] };
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/** Sorts "1-2" before "1-10", zone numbers before old numbers, vans and letters last. */
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
