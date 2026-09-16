/**
 * Small planar geometry for route shapes: metres between points, and
 * Douglas–Peucker line simplification with a tolerance in metres. Bangkok is
 * near the equator and a shape spans a few tens of kilometres, so treating
 * longitude/latitude as a plane scaled by cos(lat) is accurate to well under
 * a metre for these purposes.
 */

/** [longitude, latitude], GeoJSON order. */
export type LonLat = [number, number];

const EARTH_RADIUS = 6_371_000;

export function metersBetween(a: LonLat, b: LonLat): number {
  const [dx, dy] = planarDelta(a, b);
  return Math.hypot(dx, dy);
}

/** Path length in metres. */
export function pathLength(points: readonly LonLat[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) total += metersBetween(a, b);
  }
  return total;
}

/**
 * Douglas–Peucker: drops points that lie within `toleranceMeters` of the
 * line between their surviving neighbours. Endpoints always survive.
 */
export function simplify(points: readonly LonLat[], toleranceMeters: number): LonLat[] {
  if (points.length <= 2) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const range = stack.pop();
    if (!range) break;
    const [first, last] = range;
    let farthest = 0;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const distance = distanceToSegment(points[i], points[first], points[last]);
      if (distance > farthest) {
        farthest = distance;
        index = i;
      }
    }
    if (index !== -1 && farthest > toleranceMeters) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function distanceToSegment(point: LonLat | undefined, start: LonLat | undefined, end: LonLat | undefined): number {
  if (!point || !start || !end) return 0;
  const [px, py] = planarDelta(start, point);
  const [ex, ey] = planarDelta(start, end);
  const lengthSquared = ex * ex + ey * ey;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (px * ex + py * ey) / lengthSquared));
  return Math.hypot(px - t * ex, py - t * ey);
}

/** Metres east and north from `from` to `to`. */
function planarDelta(from: LonLat, to: LonLat): [number, number] {
  const latitude = ((from[1] + to[1]) / 2) * (Math.PI / 180);
  const dx = ((to[0] - from[0]) * Math.PI / 180) * EARTH_RADIUS * Math.cos(latitude);
  const dy = ((to[1] - from[1]) * Math.PI / 180) * EARTH_RADIUS;
  return [dx, dy];
}

/** Five decimals is about a metre; enough for a map line and much smaller on disk. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}
