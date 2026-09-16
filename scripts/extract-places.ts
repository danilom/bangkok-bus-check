/**
 * `bbc extract-places`: adds every Thai place and operator name that still
 * lacks English to `data/overrides/translations.json` as an empty draft,
 * refreshes the `usedBy` hints, and rewrites the file in review order. Never
 * overwrites an existing entry's English or status.
 */

import { compile, loadSources } from './build-data.ts';
import { saveTranslations, TRANSLATIONS_FILE, type TranslationEntry, type Translations } from './lib/translations.ts';
import type { TranslationReport } from './translate.ts';

export interface ExtractOptions {
  /** Print what the feed supplied for names it resolved, to spot bad English. */
  feedMatches: boolean;
}

export async function extractPlaces(options: ExtractOptions): Promise<void> {
  const sources = await loadSources();
  const { translation } = compile(sources);
  const { translations } = sources;

  const added = {
    places: addMissing(translations.places, translation.unresolvedPlaces),
    operators: addMissing(translations.operators, translation.unresolvedOperators),
  };
  refreshUsedBy(translations.places, translation.unresolvedPlaces, translation);
  refreshUsedBy(translations.operators, translation.unresolvedOperators, translation);

  await saveTranslations(translations);
  printSummary(translations, added, translation);
  if (options.feedMatches) {
    console.log('\nResolved from the feed (add an override entry to replace any of these):');
    for (const [th, en] of [...translation.feedResolved].sort(([a], [b]) => a.localeCompare(b, 'th'))) console.log(`  ${th} → ${en}`);
  }
}

function addMissing(section: Record<string, TranslationEntry>, unresolved: Map<string, string[]>): number {
  let added = 0;
  for (const [th, routes] of unresolved) {
    if (section[th]) continue;
    section[th] = { en: '', status: 'draft', usedBy: routes };
    added += 1;
  }
  return added;
}

/** `usedBy` is a hint regenerated each run: routes that needed the entry, or that used it. */
function refreshUsedBy(section: Record<string, TranslationEntry>, unresolved: Map<string, string[]>, report: TranslationReport): void {
  for (const [th, entry] of Object.entries(section)) {
    const needing = unresolved.get(th);
    if (needing) entry.usedBy = needing;
    else if (report.used.places.has(th) || report.used.operators.has(th)) {
      // Applied somewhere; the exact routes are not tracked, keep any hint we had.
    } else {
      delete entry.usedBy;
    }
  }
}

function printSummary(translations: Translations, added: { places: number; operators: number }, report: TranslationReport): void {
  const count = (section: Record<string, TranslationEntry>, status: 'draft' | 'ok'): number =>
    Object.values(section).filter((entry) => entry.status === status).length;
  const empty = (section: Record<string, TranslationEntry>): number => Object.values(section).filter((entry) => !entry.en).length;
  const unused = [
    ...Object.keys(translations.places).filter((th) => !report.used.places.has(th) && !report.unresolvedPlaces.has(th)),
    ...Object.keys(translations.operators).filter((th) => !report.used.operators.has(th) && !report.unresolvedOperators.has(th)),
  ];
  console.log(`${TRANSLATIONS_FILE}`);
  console.log(`  places:    ${added.places} added, ${empty(translations.places)} awaiting English, ${count(translations.places, 'draft')} draft, ${count(translations.places, 'ok')} ok`);
  console.log(`  operators: ${added.operators} added, ${empty(translations.operators)} awaiting English, ${count(translations.operators, 'draft')} draft, ${count(translations.operators, 'ok')} ok`);
  console.log(`  resolved from the feed without an entry: ${report.feedResolved.size}`);
  if (unused.length > 0) console.log(`  no longer used by any route: ${unused.join(', ')}`);
}
