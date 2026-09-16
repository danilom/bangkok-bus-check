/**
 * Swatch colours for vehicles, read from the colour words in their English
 * names ("Air-con bus, cream-red" → cream, red) with the dictionary in
 * `data/overrides/vehicle-colours.json`. A name with an unknown word gets no
 * swatch and is reported, so the dictionary can be extended.
 */

import { readFile } from 'node:fs/promises';

import type { RouteDataset } from '../src/lib/types.ts';

export const VEHICLE_COLOURS_FILE = 'data/overrides/vehicle-colours.json';

export type ColourDictionary = Record<string, string>;

export async function loadVehicleColours(path = VEHICLE_COLOURS_FILE): Promise<ColourDictionary> {
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) throw new Error(`${path}: expected an object`);
  const colours = (parsed as Record<string, unknown>)['colours'];
  if (typeof colours !== 'object' || colours === null) throw new Error(`${path}: "colours" must be an object`);
  const dictionary: ColourDictionary = {};
  for (const [word, value] of Object.entries(colours as Record<string, unknown>)) {
    if (typeof value === 'string') dictionary[word.toLowerCase()] = value;
  }
  return dictionary;
}

/** The colour words of a vehicle name: the part after the comma, without any bracketed suffix, split on hyphens. */
export function colourWords(en: string): string[] {
  const afterComma = en.split(',').slice(1).join(',');
  const bare = afterComma.replace(/\s*\([^)]*\)/g, '').trim();
  return bare ? bare.split('-').map((word) => word.trim().toLowerCase()).filter(Boolean) : [];
}

/** Sets `colours` on every vehicle whose colour words are all known; returns the unknown words with the names they occur in. */
export function tagVehicleColours(dataset: RouteDataset, dictionary: ColourDictionary): Map<string, Set<string>> {
  const unknown = new Map<string, Set<string>>();
  for (const route of dataset.routes) {
    for (const vehicle of route.vehicles) {
      if (!vehicle.en) continue;
      const words = colourWords(vehicle.en);
      const missing = words.filter((word) => dictionary[word] === undefined);
      if (words.length === 0) continue;
      if (missing.length > 0) {
        for (const word of missing) unknown.set(word, (unknown.get(word) ?? new Set()).add(vehicle.en));
        continue;
      }
      vehicle.colours = words.map((word) => dictionary[word]).filter((colour): colour is string => colour !== undefined);
    }
  }
  return unknown;
}
