/**
 * Tags stops that count as landmarks, by the keyword tiers in
 * `data/overrides/landmarks.json`. The tier name goes on the stop so the
 * app can condense long stop lists and the review command can say why a
 * stop was kept.
 */

import { readFile } from 'node:fs/promises';

import type { Landmark, RouteDataset, Stop } from '../src/lib/types.ts';
import { fixThaiTypos } from './lib/places.ts';

export const LANDMARKS_FILE = 'data/overrides/landmarks.json';

export interface LandmarkRules {
  /** Tier name → name fragments, tried in order. Major: always shown; minor: only to break a long stretch. */
  major: Record<string, string[]>;
  minor: Record<string, string[]>;
  /** Name fragments that disqualify a stop even if a tier matches ("Police Station"). */
  never: string[];
  /** Exact stop names forced in or out. */
  include: string[];
  exclude: string[];
}

export async function loadLandmarkRules(path = LANDMARKS_FILE): Promise<LandmarkRules> {
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) throw new Error(`${path}: expected an object`);
  const record = parsed as Record<string, unknown>;
  return {
    major: tiers(record['major'], `${path}: "major"`),
    minor: tiers(record['minor'], `${path}: "minor"`),
    never: strings(record['never']),
    include: strings(record['include']),
    exclude: strings(record['exclude']),
  };
}

function tiers(value: unknown, where: string): Record<string, string[]> {
  if (typeof value !== 'object' || value === null) throw new Error(`${where} must be an object`);
  const result: Record<string, string[]> = {};
  for (const [tier, fragments] of Object.entries(value as Record<string, unknown>)) result[tier] = strings(fragments);
  return result;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

export interface LandmarkMatch extends Landmark {
  /** The fragment (or listed name) that matched, for the review command. */
  fragment: string;
}

/** Why a stop counts as a landmark, or undefined when it is an ordinary stop. */
export function landmarkMatch(stop: Stop, rules: LandmarkRules): LandmarkMatch | undefined {
  const names = [stop.name.th, stop.name.en ?? ''].map(fixThaiTypos);
  if (rules.exclude.some((name) => names.includes(name))) return undefined;
  const listed = rules.include.find((name) => names.includes(name));
  if (listed) return { tier: 'listed', rank: 'major', fragment: listed };
  const lower = names.map((name) => name.toLowerCase());
  const contains = (fragment: string): boolean => lower.some((name) => name.includes(fragment.toLowerCase()));
  if (rules.never.some(contains)) return undefined;
  for (const rank of ['major', 'minor'] as const) {
    for (const [tier, fragments] of Object.entries(rules[rank])) {
      const fragment = fragments.find(contains);
      if (fragment) return { tier, rank, fragment };
    }
  }
  return undefined;
}

/** Sets `landmark` on every stop of the dataset; returns how many per tier. */
export function tagLandmarks(dataset: RouteDataset, rules: LandmarkRules): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const stop of Object.values(dataset.stops)) {
    const match = landmarkMatch(stop, rules);
    if (match) {
      stop.landmark = { tier: match.tier, rank: match.rank };
      counts[match.tier] = (counts[match.tier] ?? 0) + 1;
    } else {
      delete stop.landmark;
    }
  }
  return counts;
}
