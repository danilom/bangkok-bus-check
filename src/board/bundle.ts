/**
 * Bundles: where several legs run the same road, they are drawn side by side
 * rather than on top of each other. A leg is cut into hops (stop to next
 * stop); hops with the same stop pair are one bundle on one geometry, and the
 * bundle's members are ordered so that a leg leaving to the left sits on the
 * left, recursively from the stop outward, and no strand has to cross another
 * to get off. The map then offsets each strand by its slot.
 */

import { bearingDegrees, MeterLine, pointAlong, type LonLat } from '../lib/geometry.ts';
import type { RouteDetail } from '../lib/types.ts';
import type { FanLeg } from './fan.ts';

/** One stop-to-stop stretch of a leg. */
export interface Hop {
  /** Bundle key: the stop pair, direction included. */
  key: string;
  coordinates: LonLat[];
}

/** A place in a bundle: slot 0 is leftmost in the direction of travel; `count` members in all. */
export interface Slot {
  slot: number;
  count: number;
}

/** A leg's stretch of one bundle: drawn on the bundle's geometry, offset by its slot. */
export interface Strand extends Slot {
  leg: FanLeg;
  key: string;
  coordinates: LonLat[];
  /**
   * A taper piece: the offset is blended `factor` of the way from this
   * strand's slot to `towards` (the next strand's, or the centreline where
   * the leg leaves the stop), so strands slide between bundles and fan out
   * of the stop instead of jumping.
   */
  blend?: { towards: Slot; factor: number };
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
  alignLoneHops(legHops);
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
  const slots = new Map<string, Map<LegHops, Slot>>();
  for (const [key, list] of members) {
    const sorted = [...list].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    slots.set(key, new Map(sorted.map((entry, slot) => [entry, { slot, count: sorted.length }])));
  }
  return legHops.flatMap((entry) => {
    const strands: Strand[] = [];
    for (const hop of entry.hops) {
      const coordinates = geometry.get(hop.key);
      const slot = slots.get(hop.key)?.get(entry);
      if (coordinates && slot) strands.push({ leg: entry.leg, key: hop.key, coordinates, ...slot });
    }
    return taper(bridge(strands));
  });
}

/** A seam between two bundles' shapes is bridged up to this far; beyond it the shapes really part. */
const BRIDGE_METERS = 30;

/**
 * Consecutive hops of a leg drawn on different routes' shapes end and start
 * a few metres apart; the next strand is made to start where the last one
 * ended, so the line stays whole.
 */
function bridge(strands: readonly Strand[]): Strand[] {
  return strands.map((strand, index) => {
    const end = strands[index - 1]?.coordinates.at(-1);
    const start = strand.coordinates[0];
    if (!end || !start) return strand;
    const gap = new MeterLine([end, start]).length;
    return gap > 0.5 && gap <= BRIDGE_METERS ? { ...strand, coordinates: [end, ...strand.coordinates] } : strand;
  });
}

/** Over how many metres a strand slides from one slot to the next, and out of the stop. */
const TAPER_METERS = 40;
/** In how many pieces: each is a straight offset, so more pieces are a smoother slide. */
const TAPER_PIECES = 4;
const CENTRE: Slot = { slot: 0, count: 1 };

/** A leg's strands in order, with the taper pieces cut in where the offset changes. */
function taper(strands: readonly Strand[]): Strand[] {
  return strands.flatMap((strand, index) => {
    const next = strands[index + 1];
    const from = index === 0 ? CENTRE : undefined;
    const to = next && (next.slot !== strand.slot || next.count !== strand.count) ? { slot: next.slot, count: next.count } : undefined;
    return cutTapers(strand, from, to);
  });
}

/** The strand with its first stretch sliding in from `from` and its last sliding out to `to`, where given. */
function cutTapers(strand: Strand, from: Slot | undefined, to: Slot | undefined): Strand[] {
  const line = new MeterLine(strand.coordinates);
  // Too short to taper at both ends: slide over the whole strand, or not at all.
  const wanted = (from ? TAPER_METERS : 0) + (to ? TAPER_METERS : 0);
  const stretch = Math.min(TAPER_METERS, line.length / (wanted / TAPER_METERS || 1));
  const pieces: Strand[] = [];
  let cursor = 0;
  if (from) {
    for (let i = 0; i < TAPER_PIECES; i += 1) {
      const end = cursor + stretch / TAPER_PIECES;
      pieces.push({ ...strand, coordinates: line.slice(cursor, end), blend: { towards: from, factor: 1 - (i + 0.5) / TAPER_PIECES } });
      cursor = end;
    }
  }
  const middleEnd = to ? line.length - stretch : line.length;
  if (middleEnd > cursor) pieces.push({ ...strand, coordinates: line.slice(cursor, middleEnd) });
  cursor = Math.max(cursor, middleEnd);
  if (to) {
    for (let i = 0; i < TAPER_PIECES; i += 1) {
      const end = i === TAPER_PIECES - 1 ? line.length : cursor + stretch / TAPER_PIECES;
      pieces.push({ ...strand, coordinates: line.slice(cursor, end), blend: { towards: to, factor: (i + 0.5) / TAPER_PIECES } });
      cursor = end;
    }
  }
  return pieces.filter((piece) => piece.coordinates.length >= 2);
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
  const line = new MeterLine(leg.coordinates);
  const hops: Hop[] = [];
  let cursor = 0;
  let from = stopId;
  for (const to of direction.stops.slice(start + 1)) {
    const place = detail.stops[to];
    // A stop without a position cannot cut the shape; its hop merges into the next.
    if (place?.lat === undefined || place.lon === undefined) continue;
    const end = line.project([place.lon, place.lat], cursor).along;
    const coordinates = line.slice(cursor, end);
    if (coordinates.length >= 2) hops.push({ key: `${from}>${to}`, coordinates });
    cursor = Math.max(cursor, end);
    from = to;
  }
  return hops;
}

/** How far a lone hop may sit from a bundle's line and still be on the same road. */
const ALIGN_METERS = 25;

/**
 * An express run skips stops, so its hops pair stops the locals never pair
 * and it would draw its own line through their ribbon. Each hop no other leg
 * shares is laid against the bundles: where one lies along it, in the same
 * direction, the hop is re-keyed onto that bundle (and drawn on its
 * geometry); stretches no bundle covers stay the hop's own.
 */
function alignLoneHops(legHops: LegHops[]): void {
  const members = new Map<string, number>();
  for (const { hops } of legHops) for (const hop of hops) members.set(hop.key, (members.get(hop.key) ?? 0) + 1);
  const bundles = new Map<string, LonLat[]>();
  for (const { hops } of legHops) for (const hop of hops) if ((members.get(hop.key) ?? 0) > 1 && !bundles.has(hop.key)) bundles.set(hop.key, hop.coordinates);
  if (bundles.size === 0) return;
  for (const entry of legHops) {
    const own = new Set(entry.hops.map((hop) => hop.key));
    entry.hops = entry.hops.flatMap((hop) => (members.get(hop.key) === 1 ? alignHop(hop, bundles, own) : [hop]));
  }
}

/** The hop as a run of matched bundles and its own leftovers, in order along it. */
function alignHop(hop: Hop, bundles: ReadonlyMap<string, LonLat[]>, own: ReadonlySet<string>): Hop[] {
  const line = new MeterLine(hop.coordinates);
  const matches: { key: string; coordinates: LonLat[]; from: number; to: number }[] = [];
  for (const [key, coordinates] of bundles) {
    if (own.has(key)) continue;
    const span = line.spanOf(coordinates, ALIGN_METERS);
    if (span) matches.push({ key, coordinates, ...span });
  }
  if (matches.length === 0) return [hop];
  matches.sort((a, b) => a.from - b.from);
  const hops: Hop[] = [];
  let cursor = 0;
  let piece = 0;
  for (const match of matches) {
    if (match.from < cursor - ALIGN_METERS) continue;
    const gap = line.slice(cursor, match.from);
    if (gap.length >= 2) hops.push({ key: `${hop.key}~${piece++}`, coordinates: gap });
    hops.push({ key: match.key, coordinates: match.coordinates });
    cursor = match.to;
  }
  const tail = line.slice(cursor, line.length);
  if (tail.length >= 2) hops.push({ key: `${hop.key}~${piece}`, coordinates: tail });
  return hops;
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
