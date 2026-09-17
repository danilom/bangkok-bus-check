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
