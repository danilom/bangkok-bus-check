/**
 * The fan: for a stop, each drawable route's leg from the stop onward, with
 * a colour. Legs are sorted by the bearing of their first stretch and hues
 * handed out around the wheel in that order, so routes leaving the same way
 * get neighbouring colours and the whole reads as a rainbow.
 */

import { bearingDegrees, MeterLine, pointAlong, type LonLat } from '../lib/geometry.ts';
import type { BoardStop, RouteDetail, RouteSummary } from '../lib/types.ts';
import { oklchToHex } from './colour.ts';

export interface FanLeg {
  routeId: string;
  route: RouteSummary;
  /** Index into `RouteDetail.directions` of the run this leg follows. */
  directionIndex: number;
  /** The run's shape from the stop to the end of the run. */
  coordinates: LonLat[];
  /** Compass bearing of the leg's first stretch, for the ordering. */
  bearing: number;
  /** Hue on the colour wheel, 0–360; all of a route's legs share it. */
  hue: number;
}

/** How far along a leg its direction is judged: past the first corner, short of the first real turn. */
const BEARING_METERS = 500;

export function fanLegs(stop: BoardStop, routes: readonly RouteSummary[], details: ReadonlyMap<string, RouteDetail>): FanLeg[] {
  const legs: Omit<FanLeg, 'hue'>[] = [];
  for (const routeId of stop.routes) {
    const route = routes.find((candidate) => candidate.id === routeId);
    const detail = details.get(routeId);
    if (!route || !detail) continue;
    detail.directions.forEach((direction, directionIndex) => {
      if (direction.variant || !direction.shape || !direction.stops.includes(stop.id)) return;
      // The shapes are simplified, so the nearest vertex can be well past the stop: cut at the stop's projection.
      const line = new MeterLine(direction.shape);
      const coordinates = line.slice(line.project([stop.lon, stop.lat]).along, line.length);
      const start = coordinates[0];
      const ahead = pointAlong(coordinates, BEARING_METERS);
      if (!start || !ahead || coordinates.length < 2) return;
      legs.push({ routeId, route, directionIndex, coordinates, bearing: bearingDegrees(start, ahead) });
    });
  }
  return colourLegs(legs);
}

/** The hue wheel is used this far round: the first and the last route must not both come out red. */
const HUE_SPAN = 330;

/**
 * One hue per route, spaced evenly in the order of each route's first
 * (lowest-bearing) leg. The order starts after the widest gap in bearing
 * between neighbours, so the rainbow's two ends face a direction no bus
 * leaves in rather than each other.
 */
function colourLegs(legs: Omit<FanLeg, 'hue'>[]): FanLeg[] {
  const firstBearing = new Map<string, number>();
  for (const leg of legs) firstBearing.set(leg.routeId, Math.min(firstBearing.get(leg.routeId) ?? Infinity, leg.bearing));
  const byBearing = [...firstBearing.entries()].sort(([, a], [, b]) => a - b);
  const order = rotateToWidestGap(byBearing).map(([routeId]) => routeId);
  const hues = new Map(order.map((routeId, index) => [routeId, (index / order.length) * HUE_SPAN]));
  // In rainbow order, so the chips read as one too.
  return legs
    .map((leg) => ({ ...leg, hue: hues.get(leg.routeId) ?? 0 }))
    .sort((a, b) => a.hue - b.hue || a.bearing - b.bearing);
}

/** The bearings, sorted, rotated to begin just past the widest gap between neighbours (the wrap-around gap included). */
function rotateToWidestGap(sorted: [string, number][]): [string, number][] {
  if (sorted.length < 2) return sorted;
  let start = 0;
  let widest = -1;
  sorted.forEach(([, bearing], index) => {
    const previous = sorted.at(index - 1)?.[1] ?? bearing;
    const gap = (bearing - previous + 360) % 360;
    if (gap > widest) {
      widest = gap;
      start = index;
    }
  });
  return [...sorted.slice(start), ...sorted.slice(0, start)];
}

/**
 * A line colour for a hue, one set per basemap: on the dark map, lighter and
 * softer so the lines glow rather than blare; on the light map, deeper and
 * fuller so they hold their own against white streets. Equal lightness
 * across the wheel (OKLCH), so no hue shouts over its neighbours.
 */
export function legColour(hue: number, dark: boolean): string {
  return dark ? oklchToHex({ l: 0.76, c: 0.12, h: hue }) : oklchToHex({ l: 0.52, c: 0.17, h: hue });
}

/**
 * The same hue knocked back for a leg not singled out: opaque (translucent
 * colours would blend where twenty overlap), pulled towards the basemap in
 * lightness, a trace of chroma left so it still reads as a line, not a road.
 */
export function fadedLegColour(hue: number, dark: boolean): string {
  return dark ? oklchToHex({ l: 0.54, c: 0.07, h: hue }) : oklchToHex({ l: 0.7, c: 0.08, h: hue });
}
