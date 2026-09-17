/**
 * Which routes the board app may draw. Its question — where do the buses
 * go from here — is answered from the data alone, so a route that is not
 * there any more, or not where the data says, is worse than a missing one.
 * The rule is stated here and judged with `bbc reliability`.
 */

import type { Reliability, Route, RouteDataset, Stop } from '../src/lib/types.ts';

export type Verdict = { tier: Reliability } | { excluded: ExclusionReason };

export type ExclusionReason = 'no stop list' | 'sources disagree' | 'van' | 'hail-and-ride only' | 'no shape';

export const EXCLUSION_REASONS: readonly ExclusionReason[] = ['no stop list', 'sources disagree', 'van', 'hail-and-ride only', 'no shape'];

/** Tiers the board draws by default: two sources, or the official feed alone for a numbered bus. */
export const BOARD_TIERS: readonly Reliability[] = ['confirmed', 'official'];

export function judge(route: Route, stops: Record<string, Stop>): Verdict {
  const runs = route.directions.filter((direction) => !direction.variant);
  if (runs.length === 0) return { excluded: 'no stop list' };
  if (route.agreement === 'conflict') return { excluded: 'sources disagree' };
  if (route.service.van) return { excluded: 'van' };
  if (runs.every((run) => run.stops.every((id) => stops[id]?.hailAndRide))) return { excluded: 'hail-and-ride only' };
  if (runs.some((run) => run.shape === undefined)) return { excluded: 'no shape' };
  if (route.agreement === 'agree') return { tier: 'confirmed' };
  return { tier: route.service.suburban ? 'thin' : 'official' };
}

/** Sets `route.reliability` on every route that passes; returns the verdicts for reporting. */
export function tagReliability(dataset: RouteDataset): Map<string, Verdict> {
  const verdicts = new Map<string, Verdict>();
  for (const route of dataset.routes) {
    const verdict = judge(route, dataset.stops);
    verdicts.set(route.id, verdict);
    if ('tier' in verdict) route.reliability = verdict.tier;
    else delete route.reliability;
  }
  return verdicts;
}
