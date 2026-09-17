/**
 * Position handling for the details page: a one-shot coarse fix (or a
 * simulated position when testing), and finding the nearest stop of a run so
 * the list can be trimmed to what is still ahead. Nothing here talks to any
 * server; the app has none.
 */

import type { Stop } from './types.ts';

export interface Position {
  lat: number;
  lon: number;
}

export type PositionResult = { ok: true; position: Position } | { ok: false; reason: 'unsupported' | 'denied' | 'unavailable' };

/** Beyond this the fix is not "at" the route; show the full list and say how far the nearest stop is. */
export const NEAR_ROUTE_METERS = 1500;

/**
 * Parses a Google Maps link or a plain "lat, lon" pair:
 * `…/@13.7563,100.5018,15z`, `?q=13.7563,100.5018`, `!3d13.7563!4d100.5018`,
 * `13.7563, 100.5018`. Rejects anything outside Thailand's neighbourhood.
 */
export function parseLocationText(text: string): Position | undefined {
  const source = text.trim();
  if (!source) return undefined;
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /[?&](?:q|ll|query|center)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/,
    /^(-?\d+\.\d+)\s*[, ]\s*(-?\d+\.\d+)$/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (!match?.[1] || !match[2]) continue;
    const position = { lat: Number(match[1]), lon: Number(match[2]) };
    if (position.lat >= 5 && position.lat <= 21 && position.lon >= 97 && position.lon <= 106) return position;
  }
  return undefined;
}

/** Coarse fix: a nearby stop is a few hundred metres from the next, so accuracy of ~100 m is plenty. */
export function requestPosition(): Promise<PositionResult> {
  if (!('geolocation' in navigator)) return Promise.resolve({ ok: false, reason: 'unsupported' });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (fix) => resolve({ ok: true, position: { lat: fix.coords.latitude, lon: fix.coords.longitude } }),
      (error) => resolve({ ok: false, reason: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

/** Great-circle distance; equirectangular is fine at city scale but this costs nothing more. */
export function distanceMeters(a: Position, b: Position): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export interface NearestStop {
  index: number;
  meters: number;
}

/** Index of the stop closest to the position among those with coordinates; ties go to the earlier stop. */
/** Metres to the closest of a route's named stops across its main runs, for "nearest stop 350 m" on a card. */
export function nearestRouteStop(detail: { directions: { variant: boolean; stops: string[] }[]; stops: Record<string, Stop> }, position: Position): number | undefined {
  let best: number | undefined;
  for (const direction of detail.directions) {
    if (direction.variant) continue;
    for (const id of direction.stops) {
      const stop = detail.stops[id];
      if (!stop || stop.lat === undefined || stop.lon === undefined || stop.name.th.length === 0) continue;
      const meters = distanceMeters(position, { lat: stop.lat, lon: stop.lon });
      if (best === undefined || meters < best) best = meters;
    }
  }
  return best;
}

export function nearestStop(stops: readonly Stop[], position: Position): NearestStop | undefined {
  let best: NearestStop | undefined;
  stops.forEach((stop, index) => {
    if (stop.lat === undefined || stop.lon === undefined) return;
    const meters = distanceMeters(position, { lat: stop.lat, lon: stop.lon });
    if (!best || meters < best.meters) best = { index, meters };
  });
  return best;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
