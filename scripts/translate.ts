/**
 * Fills in English the merge could not: termini and loop labels of routes the
 * feed does not carry, and private operators' names. Resolution order per
 * text: an `override` entry, then English the feed already has for the same
 * Thai name anywhere (route names, headsigns, stops), then a normal entry.
 */

import type { LocalizedText, Route, RouteDataset } from '../src/lib/types.ts';
import { normalizePlace } from './lib/places.ts';
import { TranslationIndex, type Translations } from './lib/translations.ts';
import type { GtfsFeed } from './sources/gtfs.ts';

export interface TranslationReport {
  /** Thai place names still without English → routes that show them. */
  unresolvedPlaces: Map<string, string[]>;
  /** Thai operator names still without English → routes. */
  unresolvedOperators: Map<string, string[]>;
  /** Place names the feed supplied English for → what it said. */
  feedResolved: Map<string, string>;
  /** Entry keys (by section) that were applied to at least one route. */
  used: { places: Set<string>; operators: Set<string> };
}

/** English shown for private operators when no translation exists; treated as "no English" here. */
export const PRIVATE_OPERATOR_PLACEHOLDER = 'Private operator';

export function applyTranslations(dataset: RouteDataset, feed: GtfsFeed, translations: Translations): TranslationReport {
  const feedEnglish = feedPlaceNames(feed);
  const places = new TranslationIndex(translations.places);
  const operators = new TranslationIndex(translations.operators);
  const report: TranslationReport = {
    unresolvedPlaces: new Map(),
    unresolvedOperators: new Map(),
    feedResolved: new Map(),
    used: { places: new Set(), operators: new Set() },
  };

  for (const route of dataset.routes) {
    if (route.terminals) route.terminals = [resolvePlace(route.terminals[0], route), resolvePlace(route.terminals[1], route)];
    if (route.sideLabels) route.sideLabels = [route.sideLabels[0] && resolvePlace(route.sideLabels[0], route), route.sideLabels[1] && resolvePlace(route.sideLabels[1], route)];
    if (route.operator) route.operator = resolveOperator(route.operator, route);
  }
  return report;

  function resolvePlace(text: LocalizedText, route: Route): LocalizedText {
    const hit = places.find(text.th);
    if (hit?.entry.override && hit.entry.en) return use('places', hit.th, { th: text.th, en: hit.entry.en });
    if (text.en) return text;
    const fromFeed = feedEnglish.get(normalizePlace(text.th));
    if (fromFeed) {
      report.feedResolved.set(text.th, fromFeed);
      return { th: text.th, en: fromFeed };
    }
    if (hit?.entry.en) return use('places', hit.th, { th: text.th, en: hit.entry.en });
    note(report.unresolvedPlaces, text.th, route.id);
    return text;
  }

  function resolveOperator(text: LocalizedText, route: Route): LocalizedText {
    const hit = operators.find(text.th);
    const placeholder = !text.en || text.en === PRIVATE_OPERATOR_PLACEHOLDER;
    if (hit?.entry.en && (hit.entry.override || placeholder)) return use('operators', hit.th, { th: text.th, en: hit.entry.en });
    if (placeholder && /[ก-๛]/.test(text.th) && text.th !== 'เอกชน') note(report.unresolvedOperators, text.th, route.id);
    return text;
  }

  function use(section: 'places' | 'operators', key: string, value: LocalizedText): LocalizedText {
    report.used[section].add(key);
    return value;
  }
}

/**
 * Every Thai place name the feed pairs with English, by normalised Thai.
 * Headsigns first (each is one bilingual pair), then stops. Route long names
 * are not used: their English is occasionally in the opposite order to the
 * Thai, which would pair "สำโรง" with "Bangkhen".
 */
function feedPlaceNames(feed: GtfsFeed): Map<string, string> {
  const names = new Map<string, string>();
  const add = (text: LocalizedText | undefined): void => {
    if (!text?.en || /[ก-๛]/.test(text.en)) return;
    const key = normalizePlace(text.th);
    if (key && !names.has(key)) names.set(key, text.en);
  };
  for (const route of feed.routes) {
    for (const trip of route.trips) add(trip.headsign);
  }
  for (const route of feed.routes) {
    for (const trip of route.trips) for (const stop of trip.stops) add(stop.name);
  }
  return names;
}

function note(map: Map<string, string[]>, th: string, routeId: string): void {
  const list = map.get(th) ?? [];
  if (!list.includes(routeId)) list.push(routeId);
  map.set(th, list);
}
