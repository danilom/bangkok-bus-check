/**
 * Turns what the user typed on a numeric keypad into ranked route matches.
 *
 * The keypad has no dash and no letters, so "335" must find "3-35", "73" must
 * find 73, 73ก and 2-45 (formerly 73), and "8" must offer 8 and 8E before the
 * long tail of 80, 81, 8xx.
 */

import { searchKey } from './route-number.ts';
import type { RouteSummary } from './types.ts';

export type MatchTier = 'exact' | 'variant' | 'prefix' | 'lettered';

export interface RouteMatch<R extends RouteSummary = RouteSummary> {
  route: R;
  /** The alias that matched, so the UI can show why this route appeared. */
  alias: string;
  tier: MatchTier;
}

const MAX_RESULTS = 12;

/**
 * Returns matches ordered exact → variant → prefix, at most `MAX_RESULTS`.
 * Prefix matches are only added while there is room, so a query like "1" shows
 * route 1 and its variants first, then a short, stable sample of 1xx routes.
 */
export function findRoutes<R extends RouteSummary>(routes: readonly R[], query: string): RouteMatch<R>[] {
  const key = searchKey(query);
  if (key.length === 0) return [];
  const matches: RouteMatch<R>[] = [];
  for (const route of routes) {
    const match = matchRoute(route, key);
    if (match) matches.push(match);
  }
  return matches.sort(compareMatches).slice(0, MAX_RESULTS);
}

function matchRoute<R extends RouteSummary>(route: R, key: string): RouteMatch<R> | undefined {
  let best: RouteMatch<R> | undefined;
  for (const alias of route.aliases) {
    const tier = classify(searchKey(alias), key);
    if (!tier) continue;
    if (!best || TIER_RANK[tier] < TIER_RANK[best.tier]) best = { route, alias, tier };
  }
  return best;
}

const TIER_RANK: Record<MatchTier, number> = { exact: 0, variant: 1, prefix: 2, lettered: 3 };

/**
 * exact:    alias key equals the query ("335" ~ "3-35", "73" ~ "73")
 * variant:  query plus a letter suffix only ("8" ~ "8E", "73" ~ "73ก")
 * prefix:   query is a proper prefix and more digits follow ("7" ~ "70", "1" ~ "1-10")
 * lettered: the alias has a prefix the keypad cannot type ("1" ~ "A1", "S1", "ต.1")
 */
function classify(aliasKey: string, key: string): MatchTier | undefined {
  if (aliasKey === key) return 'exact';
  if (aliasKey.startsWith(key)) {
    const rest = aliasKey.slice(key.length);
    return /^[^0-9]+$/.test(rest) ? 'variant' : 'prefix';
  }
  const unlettered = aliasKey.replace(/^(?:[A-Z]+|ต\.)/, '');
  if (unlettered !== aliasKey && unlettered.length > 0 && /^\d/.test(key) && unlettered.startsWith(key)) return 'lettered';
  return undefined;
}

function compareMatches(a: RouteMatch, b: RouteMatch): number {
  return (
    TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
    // Within a tier, well-documented city routes beat OSM-only songthaews and
    // shuttles that happen to share the number.
    completeness(b.route) - completeness(a.route) ||
    // Then the number on the bus beats a former number.
    Number(b.alias === b.route.number) - Number(a.alias === a.route.number) ||
    // Shorter aliases are closer to what was typed ("70" before "700").
    a.alias.length - b.alias.length ||
    a.route.id.localeCompare(b.route.id)
  );
}

function completeness(route: RouteSummary): number {
  return (route.sources.wikipedia ? 2 : 0) + (route.terminals ? 1 : 0) + (route.directionCount > 0 ? 1 : 0);
}
