/**
 * Reads the Namtang GTFS tables (Office of Transport and Traffic Policy and
 * Planning, Ministry of Transport) into per-route records with ordered stops
 * per trip. Names in the feed are "Thai;English".
 */

import { canonicalRouteNumber } from '../../src/lib/route-number.ts';
import type { LocalizedText, Stop } from '../../src/lib/types.ts';
import { parseCsv } from '../lib/csv.ts';

export interface GtfsTables {
  agency: string;
  routes: string;
  trips: string;
  stopTimes: string;
  stops: string;
  frequencies: string;
  feedInfo: string;
}

export interface GtfsTrip {
  tripId: string;
  directionId: 0 | 1;
  headsign?: LocalizedText;
  stops: Stop[];
}

export interface GtfsRoute {
  routeId: string;
  agencyId: string;
  agencyName: LocalizedText;
  /** Numbers named in route_short_name, canonicalised ("2-45 (73)" → [2-45, 73]). */
  numbers: string[];
  /** The short name as published, for display of vans and oddities. */
  shortName: string;
  longName: LocalizedText;
  trips: GtfsTrip[];
  /** Earliest start and latest end across the route's service windows, "HH:MM". */
  hours?: { start: string; end: string };
  /** A service window covers the small hours (01:00–04:00). */
  night: boolean;
}

export interface GtfsFeed {
  version: string;
  routes: GtfsRoute[];
}

const BUS = '3';

/** Bangkok and the surrounding provinces; intercity coaches leave this box. */
const BBOX = { minLat: 13.3, maxLat: 14.3, minLon: 100.1, maxLon: 101.1 };
/** Share of a route's stops that must lie in the box for it to count as a Bangkok route. */
const MIN_IN_BBOX = 0.9;

export function parseGtfs(tables: GtfsTables): GtfsFeed {
  const version = parseCsv(tables.feedInfo)[0]?.['feed_version'] ?? 'unknown';
  const agencies = new Map(parseCsv(tables.agency).map((row) => [row['agency_id'] ?? '', localized(row['agency_name'] ?? '')]));
  const stops = parseStops(tables.stops);
  const stopsByTrip = groupStopTimes(tables.stopTimes, stops);
  const tripsByRoute = groupTrips(tables.trips, stopsByTrip);
  const windows = groupFrequencies(tables.frequencies);

  const routes: GtfsRoute[] = [];
  for (const row of parseCsv(tables.routes)) {
    if (row['route_type'] !== BUS) continue;
    const trips = tripsByRoute.get(row['route_id'] ?? '') ?? [];
    if (!inBangkok(trips)) continue;
    const route = toRoute(row, trips, agencies, windows);
    if (route) routes.push(route);
  }
  return { version, routes };
}

function toRoute(
  row: Record<string, string>,
  trips: GtfsTrip[],
  agencies: Map<string, LocalizedText>,
  windows: Map<string, ServiceWindow[]>,
): GtfsRoute | undefined {
  const routeId = row['route_id'] ?? '';
  const shortName = row['route_short_name'] ?? '';
  const numbers = parseShortName(shortName);
  if (numbers.length === 0) return undefined;
  const agencyId = row['agency_id'] ?? '';
  const routeWindows = trips.flatMap((trip) => windows.get(trip.tripId) ?? []);
  const route: GtfsRoute = {
    routeId,
    agencyId,
    agencyName: agencies.get(agencyId) ?? { th: agencyId },
    numbers,
    shortName,
    longName: localized(row['route_long_name'] ?? ''),
    trips,
    night: routeWindows.some(coversSmallHours),
  };
  const hours = serviceHours(routeWindows);
  if (hours) route.hours = hours;
  return route;
}

/**
 * "2-45 (73)" → [2-45, 73]; "ต.99" → [ต.99]; "1-14E" → [1-14E].
 * Loop routes are written "1-64L" / "1-64R" (left/right); the letter is the
 * rotation sense, not part of the number, so both map to "1-64".
 */
export function parseShortName(shortName: string): string[] {
  const numbers: string[] = [];
  for (const token of shortName.split(/[()/,]/)) {
    const number = canonicalRouteNumber(token)?.replace(/^(\d+-\d+|\d+)[LR]$/, '$1');
    if (number && !numbers.includes(number)) numbers.push(number);
  }
  return numbers;
}

/** "ไทย;English" → { th, en }. Either half may be missing or padded. */
export function localized(raw: string): LocalizedText {
  const [th = '', en = ''] = raw.split(';').map((part) => part.trim());
  return en ? { th: th || en, en } : { th };
}

function parseStops(table: string): Map<string, Stop> {
  const stops = new Map<string, Stop>();
  for (const row of parseCsv(table)) {
    const id = row['stop_id'] ?? '';
    const lat = Number(row['stop_lat']);
    const lon = Number(row['stop_lon']);
    const stop: Stop = { id: `s${id}`, name: localized(row['stop_name'] ?? '') };
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      stop.lat = lat;
      stop.lon = lon;
    }
    stops.set(id, stop);
  }
  return stops;
}

function groupStopTimes(table: string, stops: Map<string, Stop>): Map<string, Stop[]> {
  const bySequence = new Map<string, { sequence: number; stop: Stop }[]>();
  for (const row of parseCsv(table)) {
    const stop = stops.get(row['stop_id'] ?? '');
    if (!stop) continue;
    const tripId = row['trip_id'] ?? '';
    const list = bySequence.get(tripId) ?? [];
    list.push({ sequence: Number(row['stop_sequence']), stop });
    bySequence.set(tripId, list);
  }
  const ordered = new Map<string, Stop[]>();
  for (const [tripId, list] of bySequence) {
    ordered.set(tripId, list.sort((a, b) => a.sequence - b.sequence).map((entry) => entry.stop));
  }
  return ordered;
}

function groupTrips(table: string, stopsByTrip: Map<string, Stop[]>): Map<string, GtfsTrip[]> {
  const byRoute = new Map<string, GtfsTrip[]>();
  for (const row of parseCsv(table)) {
    const tripId = row['trip_id'] ?? '';
    const trip: GtfsTrip = {
      tripId,
      directionId: row['direction_id'] === '1' ? 1 : 0,
      stops: stopsByTrip.get(tripId) ?? [],
    };
    const headsign = row['trip_headsign'];
    if (headsign) trip.headsign = localized(headsign);
    const routeId = row['route_id'] ?? '';
    byRoute.set(routeId, [...(byRoute.get(routeId) ?? []), trip]);
  }
  return byRoute;
}

interface ServiceWindow {
  start: number;
  end: number;
}

function groupFrequencies(table: string): Map<string, ServiceWindow[]> {
  const byTrip = new Map<string, ServiceWindow[]>();
  for (const row of parseCsv(table)) {
    const start = parseGtfsTime(row['start_time'] ?? '');
    const end = parseGtfsTime(row['end_time'] ?? '');
    if (start === undefined || end === undefined) continue;
    const tripId = row['trip_id'] ?? '';
    byTrip.set(tripId, [...(byTrip.get(tripId) ?? []), { start, end }]);
  }
  return byTrip;
}

/** GTFS times run past midnight ("25:30:00" is 01:30 the next day); minutes since service day start. */
function parseGtfsTime(text: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})/.exec(text);
  if (!match?.[1] || !match[2]) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

function coversSmallHours(window: ServiceWindow): boolean {
  // 01:00–04:00 either as an early-morning window or as "25:00–28:00" continuing a day.
  const [from, to] = [60, 240];
  return (window.start <= from && window.end >= to) || (window.start <= from + 1440 && window.end >= to + 1440);
}

function serviceHours(windows: ServiceWindow[]): { start: string; end: string } | undefined {
  if (windows.length === 0) return undefined;
  const start = Math.min(...windows.map((window) => window.start));
  const end = Math.max(...windows.map((window) => window.end));
  const format = (minutes: number): string => {
    const clock = minutes % 1440;
    return `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`;
  };
  return { start: format(start), end: format(end) };
}

function inBangkok(trips: GtfsTrip[]): boolean {
  const stops = trips.flatMap((trip) => trip.stops).filter((stop) => stop.lat !== undefined && stop.lon !== undefined);
  if (stops.length === 0) return false;
  const inside = stops.filter(
    (stop) => (stop.lat ?? 0) >= BBOX.minLat && (stop.lat ?? 0) <= BBOX.maxLat && (stop.lon ?? 0) >= BBOX.minLon && (stop.lon ?? 0) <= BBOX.maxLon,
  ).length;
  return inside / stops.length >= MIN_IN_BBOX;
}
