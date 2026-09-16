/**
 * Route-number handling shared by the data pipeline and the app.
 *
 * Bangkok has two numbering systems in use at once: the pre-reform numbers
 * ("73", "39A", "73ก") and the reform numbers with a zone prefix ("2-45",
 * "1-2E"). Sources spell them inconsistently ("1 - 1", "1-1", "1–1"), so
 * everything is funnelled through `canonicalRouteNumber` before comparison.
 */

const DASHES = /[\u2010-\u2015\u2212]/g;
const INVISIBLE = /[\u200B\u200C\u200D\uFEFF]/g;

/** Passenger-van lines are numbered "ต.99" (ต. = ตู้, van). */
export const VAN_PREFIX = 'ต.';

// Latin prefix (A1, S2, M16), digits, optional short Latin/Thai suffix (39A,
// 73ก, 13AC, 3-25EX), optionally a zone-dash form ("1-2E"), or a van number. Suffixes are
// capped at three letters so "1009 Songthaew" cannot pass as "1009SONGTHAEW".
const ROUTE_NUMBER = /^(?:[A-Z]{1,2}\d+[A-Z]{0,3}|ต\.\d+[A-Z]{0,3}|\d+(?:-\d+)?[A-Z]{0,3}[\u0E00-\u0E7F]{0,2})$/;

const ZONE_NUMBER = /^[1-4]-\d+[A-Z]*$/;

/**
 * Normalises spelling without changing identity: "1 - 1" → "1-1",
 * "39a" → "39A", removes zero-width characters. Returns `undefined` when the
 * input is not shaped like a route number at all ("Shuttle Bus", "-").
 */
export function canonicalRouteNumber(raw: string): string | undefined {
  const compact = raw
    .replace(INVISIBLE, '')
    .replace(DASHES, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, '')
    .toUpperCase();
  return ROUTE_NUMBER.test(compact) ? compact : undefined;
}

/**
 * Search form: dashes, spaces and invisible characters removed, uppercase, so
 * "3-35" and "335" collide. Accepts partial input ("7"), unlike
 * `canonicalRouteNumber`.
 */
export function searchKey(raw: string): string {
  return raw.replace(INVISIBLE, '').replace(DASHES, '').replace(/[\s-]/g, '').toUpperCase();
}

export function isVanNumber(number: string): boolean {
  return number.startsWith(VAN_PREFIX);
}

/** True for reform-era numbers with a zone prefix ("2-45", "1-2E"). */
export function isZoneNumber(number: string): boolean {
  return ZONE_NUMBER.test(number);
}

/**
 * Picks the identity for a set of equivalent numbers: the zone-style number
 * when there is one, then a letter-prefixed one (airport "S2" over its old
 * "554"), otherwise the first number given. Zone numbers are unique across
 * operators; old numbers are not (private minibus "2" ≠ TSB "2"/"3-1").
 */
export function pickPrimaryNumber(numbers: readonly string[]): string | undefined {
  return numbers.find(isZoneNumber) ?? numbers.find((number) => /^[A-Z]/.test(number)) ?? numbers[0];
}
