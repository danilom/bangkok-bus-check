/**
 * `bbc extract-places`: adds every Thai place and operator name that still
 * lacks English to `data/overrides/translations.json` as an empty draft,
 * refreshes the `usedBy` hints, and rewrites the file in review order. Never
 * overwrites an existing entry's English or status.
 */

import { resolve } from 'node:path';

import { compile, loadSources } from './build-data.ts';
import { saveTranslations, TRANSLATIONS_FILE, type TranslationEntry, type Translations } from './lib/translations.ts';
import type { TranslationReport } from './translate.ts';

export interface ExtractOptions {
  /** Print the English the feed supplied for the names it resolved, as paste-ready JSON lines. */
  feedEnglish: boolean;
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
  if (options.feedEnglish) printFeedEnglish(translation.feedResolved);
  // Full path last and highlighted, so a terminal can open it with one click.
  console.log(`\n\u001b[36m${resolve(TRANSLATIONS_FILE)}\u001b[0m`);
}

/**
 * The feed's English for names it resolved, one JSON line each so any of
 * them can be pasted into the file as an override and edited. Values are
 * aligned on the key column when the keys are not absurdly long.
 */
function printFeedEnglish(resolved: Map<string, string>): void {
  const rows = [...resolved].sort(([a], [b]) => a.localeCompare(b, 'th'));
  const widths = rows.map(([th]) => displayWidth(JSON.stringify(th)));
  const column = Math.min(Math.max(...widths, 0), 36);
  console.log('\nEnglish the feed supplied (paste a line to override it):');
  for (const [th, en] of rows) {
    const key = JSON.stringify(th);
    const pad = ' '.repeat(Math.max(0, column - displayWidth(key)));
    console.log(`  ${key}:${pad} ${JSON.stringify(en)},`);
  }
}

/** Terminal columns a string takes: Thai vowel and tone marks stack on the previous letter. */
function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) if (!/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(char)) width += 1;
  return width;
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
