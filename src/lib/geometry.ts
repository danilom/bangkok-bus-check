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
