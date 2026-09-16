/**
 * Hand-supervised English for Thai text the feed cannot supply, kept in
 * `data/overrides/translations.json`. Only entries that need a human live
 * here: anything the feed already names in English is resolved at build
 * time and never written to the file.
 *
 * Sections are keyed by the Thai text as it appears in the source. Each
 * entry: `en`, `status` ("draft" = written by the assistant, "ok" =
 * reviewed), optional `override` (apply even where the feed has English),
 * `usedBy` (regenerated hint), `note` (free text). A plain string value is
 * shorthand for a reviewed override — what a person adds by hand.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { normalizePlace } from './places.ts';

export const TRANSLATIONS_FILE = 'data/overrides/translations.json';

export type TranslationStatus = 'draft' | 'ok';

export interface TranslationEntry {
  en: string;
  status: TranslationStatus;
  override?: boolean;
  usedBy?: string[];
  note?: string;
}

export type TranslationSection = 'places' | 'operators' | 'vehicles';
export const TRANSLATION_SECTIONS: readonly TranslationSection[] = ['places', 'operators', 'vehicles'];

export type Translations = Record<TranslationSection, Record<string, TranslationEntry>>;

export function emptyTranslations(): Translations {
  return { places: {}, operators: {}, vehicles: {} };
}

export async function loadTranslations(path = TRANSLATIONS_FILE): Promise<Translations> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return emptyTranslations();
    throw error;
  }
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) throw new Error(`${path}: expected an object`);
  const result = emptyTranslations();
  for (const section of TRANSLATION_SECTIONS) {
    const raw = (parsed as Record<string, unknown>)[section];
    if (raw === undefined) continue;
    if (typeof raw !== 'object' || raw === null) throw new Error(`${path}: "${section}" must be an object`);
    for (const [th, value] of Object.entries(raw as Record<string, unknown>)) result[section][th] = parseEntry(value, `${section}.${th}`);
  }
  return result;
}

/** Accepts the short forms a reviewer types ("r", "ok", "reviewed") and normalises them. */
function parseEntry(value: unknown, where: string): TranslationEntry {
  if (typeof value === 'string') return { en: value, status: 'ok', override: true };
  if (typeof value !== 'object' || value === null) throw new Error(`${where}: expected an object or a string`);
  const record = value as Record<string, unknown>;
  const en = typeof record['en'] === 'string' ? record['en'] : '';
  const rawStatus = String(record['status'] ?? 'draft').toLowerCase();
  const status: TranslationStatus = ['ok', 'r', 'reviewed', 'okay', 'done'].includes(rawStatus) ? 'ok' : 'draft';
  const entry: TranslationEntry = { en, status };
  if (record['override'] === true) entry.override = true;
  if (Array.isArray(record['usedBy'])) entry.usedBy = record['usedBy'].filter((item): item is string => typeof item === 'string');
  if (typeof record['note'] === 'string' && record['note']) entry.note = record['note'];
  return entry;
}

/**
 * Writes the file in review order — drafts first, then overrides, then
 * reviewed — alphabetical within each, one entry per line so diffs stay
 * readable.
 */
export async function saveTranslations(translations: Translations, path = TRANSLATIONS_FILE): Promise<void> {
  const sections = TRANSLATION_SECTIONS.map((section) => {
    const entries = Object.entries(translations[section]).sort(compareEntries);
    const lines = entries.map(([th, entry]) => `    ${JSON.stringify(th)}: ${formatEntry(entry)}`);
    return `  ${JSON.stringify(section)}: {\n${lines.join(',\n')}\n  }`;
  });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `{\n${sections.join(',\n')}\n}\n`, 'utf8');
}

function rank(entry: TranslationEntry): number {
  if (entry.status === 'draft') return 0;
  if (entry.override) return 1;
  return 2;
}

function compareEntries([thA, a]: [string, TranslationEntry], [thB, b]: [string, TranslationEntry]): number {
  return rank(a) - rank(b) || thA.localeCompare(thB, 'th');
}

function formatEntry(entry: TranslationEntry): string {
  const parts = [`"en": ${JSON.stringify(entry.en)}`, `"status": ${JSON.stringify(entry.status)}`];
  if (entry.override) parts.push('"override": true');
  if (entry.usedBy && entry.usedBy.length > 0) parts.push(`"usedBy": ${JSON.stringify(entry.usedBy)}`);
  if (entry.note) parts.push(`"note": ${JSON.stringify(entry.note)}`);
  return `{ ${parts.join(', ')} }`;
}

/** Lookup by normalised Thai, so spacing and station prefixes do not defeat a match. */
export class TranslationIndex {
  private readonly byKey = new Map<string, { th: string; entry: TranslationEntry }>();

  constructor(entries: Record<string, TranslationEntry>) {
    for (const [th, entry] of Object.entries(entries)) this.byKey.set(normalizePlace(th), { th, entry });
  }

  find(th: string): { th: string; entry: TranslationEntry } | undefined {
    return this.byKey.get(normalizePlace(th));
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT';
}
