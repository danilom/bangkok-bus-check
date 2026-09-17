/** Shape arithmetic shared by the maps: [lon, lat] pairs as the route files store them. */

import { distanceMeters } from './location.ts';

export type LonLat = [number, number];

/** The shape point closest to a place: the line is cut there. Good to a few metres, which is all the eye needs. */
export function nearestShapeIndex(shape: readonly LonLat[], place: { lat: number; lon: number }): number | undefined {
  if (shape.length === 0) return undefined;
  let best = 0;
  let bestMeters = Infinity;
  shape.forEach(([lon, lat], index) => {
    const meters = distanceMeters(place, { lat, lon });
    if (meters < bestMeters) {
      bestMeters = meters;
      best = index;
    }
  });
  return best;
}

/** Initial compass bearing from `from` to `to`, 0–360 with north 0 and east 90. */
export function bearingDegrees(from: LonLat, to: LonLat): number {
  const toRad = Math.PI / 180;
  const lat1 = from[1] * toRad;
  const lat2 = to[1] * toRad;
  const dLon = (to[0] - from[0]) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) / toRad) + 360) % 360;
}

/** The point `meters` along the line from its start (the last point when the line is shorter). */
export function pointAlong(shape: readonly LonLat[], meters: number): LonLat | undefined {
  const first = shape[0];
  if (!first) return undefined;
  let walked = 0;
  for (let i = 1; i < shape.length; i += 1) {
    const from = shape[i - 1];
    const to = shape[i];
    if (!from || !to) break;
    const step = distanceMeters({ lon: from[0], lat: from[1] }, { lon: to[0], lat: to[1] });
    if (walked + step >= meters) {
      const fraction = step === 0 ? 0 : (meters - walked) / step;
      return [from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction];
    }
    walked += step;
  }
  return shape.at(-1);
}

/** Metres per degree of latitude, and of longitude at Bangkok's latitude: near enough for projecting onto a street. */
const METERS_PER_DEGREE_LAT = 111_320;
const METERS_PER_DEGREE_LON = 111_320 * Math.cos((13.75 * Math.PI) / 180);

/** A polyline in local metres, with distances along it, for projecting other lines onto it. */
export class MeterLine {
  private readonly xs: number[];
  private readonly ys: number[];
  /** Distance along the line at each vertex. */
  private readonly along: number[];
  readonly length: number;
  private readonly coordinates: readonly LonLat[];

  constructor(coordinates: readonly LonLat[]) {
    this.coordinates = coordinates;
    const origin = coordinates[0] ?? [0, 0];
    this.xs = coordinates.map(([lon]) => (lon - origin[0]) * METERS_PER_DEGREE_LON);
    this.ys = coordinates.map(([, lat]) => (lat - origin[1]) * METERS_PER_DEGREE_LAT);
    this.along = [0];
    for (let i = 1; i < coordinates.length; i += 1) {
      this.along.push((this.along[i - 1] ?? 0) + Math.hypot((this.xs[i] ?? 0) - (this.xs[i - 1] ?? 0), (this.ys[i] ?? 0) - (this.ys[i - 1] ?? 0)));
    }
    this.length = this.along.at(-1) ?? 0;
  }

  /** Where `point` falls along the line and how far off it is; with `after`, only at or past that distance along. */
  project(point: LonLat, after = 0): { along: number; meters: number } {
    const origin = this.coordinates[0] ?? [0, 0];
    const px = (point[0] - origin[0]) * METERS_PER_DEGREE_LON;
    const py = (point[1] - origin[1]) * METERS_PER_DEGREE_LAT;
    let best = { along: after, meters: Infinity };
    for (let i = 0; i < this.xs.length - 1; i += 1) {
      const start = this.along[i] ?? 0;
      const ax = this.xs[i] ?? 0;
      const ay = this.ys[i] ?? 0;
      const bx = (this.xs[i + 1] ?? 0) - ax;
      const by = (this.ys[i + 1] ?? 0) - ay;
      const length = Math.sqrt(bx * bx + by * by);
      const tMin = length === 0 ? 0 : (after - start) / length;
      if (tMin > 1) continue;
      const t = length === 0 ? 0 : Math.max(tMin, 0, Math.min(1, ((px - ax) * bx + (py - ay) * by) / (length * length)));
      const meters = Math.hypot(px - ax - bx * t, py - ay - by * t);
      if (meters < best.meters) best = { along: start + length * t, meters };
    }
    return best;
  }

  /**
   * The stretch of this line that `other` runs along, if it does: every
   * point of `other` within `tolerance` metres, in this line's direction,
   * and the stretch not much shorter than `other` (a line crossing at a
   * point does not count).
   */
  spanOf(other: readonly LonLat[], tolerance: number): { from: number; to: number } | undefined {
    let previous = -Infinity;
    let from = Infinity;
    let to = -Infinity;
    for (const point of other) {
      const { along, meters } = this.project(point);
      if (meters > tolerance || along < previous - tolerance) return undefined;
      previous = Math.max(previous, along);
      from = Math.min(from, along);
      to = Math.max(to, along);
    }
    const otherLength = new MeterLine(other).length;
    return to - from >= otherLength * 0.6 && to - from > 0 ? { from, to } : undefined;
  }

  /** The line between two distances along it: the end points interpolated, the vertices between kept. */
  slice(from: number, to: number): LonLat[] {
    if (to - from <= 0.5) return [];
    const points: LonLat[] = [this.pointAt(from)];
    for (let i = 0; i < this.coordinates.length; i += 1) {
      const at = this.along[i] ?? 0;
      const point = this.coordinates[i];
      if (point && at > from && at < to) points.push(point);
    }
    points.push(this.pointAt(to));
    return points;
  }

  /** The point `distance` metres along the line (the end when it is shorter). */
  pointAt(distance: number): LonLat {
    for (let i = 1; i < this.coordinates.length; i += 1) {
      const at = this.along[i] ?? 0;
      const a = this.coordinates[i - 1];
      const b = this.coordinates[i];
      if (at >= distance && a && b) {
        const before = this.along[i - 1] ?? 0;
        const t = at === before ? 0 : (distance - before) / (at - before);
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
    }
    return this.coordinates.at(-1) ?? [0, 0];
  }
}
