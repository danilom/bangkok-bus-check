/**
 * Bundles: where several legs run the same road, they are drawn side by side
 * rather than on top of each other. A leg is cut into hops (stop to next
 * stop); hops with the same stop pair are one bundle on one geometry, and the
 * bundle's members are ordered so that a leg leaving to the left sits on the
 * left, recursively from the stop outward, and no strand has to cross another
 * to get off. The map then offsets each strand by its slot.
 */

import { bearingDegrees, pointAlong, type LonLat } from '../lib/geometry.ts';
import type { RouteDetail } from '../lib/types.ts';
import type { FanLeg } from './fan.ts';

/** One stop-to-stop stretch of a leg. */
export interface Hop {
  /** Bundle key: the stop pair, direction included. */
  key: string;
  coordinates: LonLat[];
}

/** A leg's stretch of one bundle: drawn on the bundle's geometry, offset by its slot. */
export interface Strand {
  leg: FanLeg;
  key: string;
  coordinates: LonLat[];
  /** 0 = leftmost in the direction of travel. */
  slot: number;
  /** Members of this bundle. */
  count: number;
}

/** How far into a hop its direction is judged, for the turn at a divergence. */
const TURN_METERS = 60;

/**
 * Cuts the legs into hops, bundles them by stop pair and orders each bundle's
 * members. `legs` are the fan's legs from `stopId`; `details` hold their runs'
 * stop lists and stop positions.
 */
export function bundleLegs(stopId: string, legs: readonly FanLeg[], details: ReadonlyMap<string, RouteDetail>): Strand[] {
  const legHops = legs.map((leg) => ({ leg, hops: hopsOf(stopId, leg, details) }));
  const geometry = new Map<string, LonLat[]>();
  for (const { hops } of legHops) for (const hop of hops) if (!geometry.has(hop.key)) geometry.set(hop.key, hop.coordinates);
  const order = orderLegs(legHops, geometry);
  const rank = new Map(order.map((entry, index) => [entry, index]));
  const members = new Map<string, LegHops[]>();
  for (const entry of legHops) {
    for (const hop of entry.hops) {
      const list = members.get(hop.key) ?? [];
      if (!list.includes(entry)) list.push(entry);
      members.set(hop.key, list);
    }
  }
  const strands: Strand[] = [];
  for (const [key, list] of members) {
    const coordinates = geometry.get(key);
    if (!coordinates) continue;
    const sorted = [...list].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    sorted.forEach((entry, slot) => strands.push({ leg: entry.leg, key, coordinates, slot, count: sorted.length }));
  }
  return strands;
}

interface LegHops {
  leg: FanLeg;
  hops: Hop[];
}

/**
 * The leg's run cut at its stops from `stopId` on. The shapes are simplified
 * for the map, so several stops can fall between two vertices: each stop is
 * projected onto the polyline and the cut made there. The shape is walked
 * forward only, so a loop cannot jump ahead of itself.
 */
function hopsOf(stopId: string, leg: FanLeg, details: ReadonlyMap<string, RouteDetail>): Hop[] {
  const detail = details.get(leg.routeId);
  const direction = detail?.directions[leg.directionIndex];
  if (!detail || !direction) return [];
  const start = direction.stops.indexOf(stopId);
  if (start < 0) return [];
  const hops: Hop[] = [];
  let cursor: ShapePosition = { segment: 0, t: 0 };
  let from = stopId;
  for (const to of direction.stops.slice(start + 1)) {
    const place = detail.stops[to];
    // A stop without a position cannot cut the shape; its hop merges into the next.
    if (place?.lat === undefined || place.lon === undefined) continue;
    const end = projectOnto(leg.coordinates, [place.lon, place.lat], cursor);
    if (!end) break;
    const coordinates = slicePositions(leg.coordinates, cursor, end);
    if (coordinates.length >= 2) hops.push({ key: `${from}>${to}`, coordinates });
    cursor = end;
    from = to;
  }
  return hops;
}

/** A place on a polyline: on segment `segment` (from vertex `segment` to `segment + 1`), `t` of the way along it. */
interface ShapePosition {
  segment: number;
  t: number;
}

/** Metres per degree of latitude, and of longitude at Bangkok's latitude: near enough for projecting onto a street. */
const METERS_PER_DEGREE_LAT = 111_320;
const METERS_PER_DEGREE_LON = 111_320 * Math.cos((13.75 * Math.PI) / 180);

/** The nearest point on the polyline at or after `after`, as a position; undefined for a shape too short to have a segment. */
function projectOnto(shape: readonly LonLat[], place: LonLat, after: ShapePosition): ShapePosition | undefined {
  let best: ShapePosition | undefined;
  let bestMeters = Infinity;
  for (let segment = after.segment; segment < shape.length - 1; segment += 1) {
    const a = shape[segment];
    const b = shape[segment + 1];
    if (!a || !b) break;
    const ax = (place[0] - a[0]) * METERS_PER_DEGREE_LON;
    const ay = (place[1] - a[1]) * METERS_PER_DEGREE_LAT;
    const bx = (b[0] - a[0]) * METERS_PER_DEGREE_LON;
    const by = (b[1] - a[1]) * METERS_PER_DEGREE_LAT;
    const length = bx * bx + by * by;
    let t = length === 0 ? 0 : (ax * bx + ay * by) / length;
    t = Math.max(segment === after.segment ? after.t : 0, Math.min(1, t));
    const meters = Math.hypot(ax - bx * t, ay - by * t);
    if (meters < bestMeters) {
      bestMeters = meters;
      best = { segment, t };
    }
  }
  return best;
}

function pointAt(shape: readonly LonLat[], position: ShapePosition): LonLat | undefined {
  const a = shape[position.segment];
  const b = shape[position.segment + 1] ?? a;
  if (!a || !b) return undefined;
  return [a[0] + (b[0] - a[0]) * position.t, a[1] + (b[1] - a[1]) * position.t];
}

/** The polyline between two positions on it: the start point, the vertices between, the end point. */
function slicePositions(shape: readonly LonLat[], from: ShapePosition, to: ShapePosition): LonLat[] {
  const start = pointAt(shape, from);
  const end = pointAt(shape, to);
  if (!start || !end) return [];
  const between = shape.slice(from.segment + 1, to.segment + 1);
  const points = [start, ...between, end];
  return points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]));
}

function samePoint(a: LonLat, b: LonLat | undefined): boolean {
  return b !== undefined && Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

/**
 * A total order of the legs, left to right: legs sharing their first hop are
 * ordered by where they part, recursively; groups leaving the stop by
 * different first hops are laid out by bearing (they never share a bundle,
 * so only the order within each matters).
 */
function orderLegs(legHops: readonly LegHops[], geometry: ReadonlyMap<string, LonLat[]>): LegHops[] {
  const roots = groupBy(legHops, (entry) => entry.hops[0]?.key);
  const sorted = [...roots.entries()].sort(([a], [b]) => (a === undefined ? 1 : b === undefined ? -1 : startBearing(geometry.get(a)) - startBearing(geometry.get(b))));
  return sorted.flatMap(([, group]) => orderGroup(group, 1, geometry));
}

/** Orders legs that share hops `0..depth-1`: the ones parting at `depth` by their turn, the rest by recursing. */
function orderGroup(group: readonly LegHops[], depth: number, geometry: ReadonlyMap<string, LonLat[]>): LegHops[] {
  if (group.length <= 1) return [...group];
  const first = group[0]?.hops[depth - 1];
  const incoming = first ? endBearing(geometry.get(first.key)) : 0;
  const parts = groupBy(group, (entry) => entry.hops[depth]?.key);
  if (parts.size === 1 && !parts.has(undefined)) return orderGroup(group, depth + 1, geometry);
  // A leg that ends here has no side; it takes the middle so the others keep theirs.
  const turnOf = (key: string | undefined): number => (key === undefined ? 0 : turnDegrees(incoming, startBearing(geometry.get(key))));
  const sorted = [...parts.entries()].sort(([a], [b]) => turnOf(a) - turnOf(b));
  return sorted.flatMap(([key, part]) => (key === undefined ? [...part] : orderGroup(part, depth + 1, geometry)));
}

function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return groups;
}

/** Bearing of a line's first stretch. */
function startBearing(line: readonly LonLat[] | undefined): number {
  const from = line?.[0];
  const to = line ? pointAlong(line, TURN_METERS) : undefined;
  return from && to ? bearingDegrees(from, to) : 0;
}

/** Bearing of a line's last stretch, the way it is travelled. */
function endBearing(line: readonly LonLat[] | undefined): number {
  const to = line?.at(-1);
  const from = line ? pointAlong([...line].reverse(), TURN_METERS) : undefined;
  return from && to ? bearingDegrees(from, to) : 0;
}

/** The turn from one bearing to another, -180..180: negative is a left turn. */
export function turnDegrees(from: number, to: number): number {
  const turn = ((to - from + 540) % 360) - 180;
  return turn === -180 ? 180 : turn;
}
