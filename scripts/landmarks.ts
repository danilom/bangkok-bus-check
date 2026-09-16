/**
 * Tags stops that count as landmarks, by the keyword tiers in
 * `data/overrides/landmarks.json`. The tier name goes on the stop so the
 * app can condense long stop lists and the review command can say why a
 * stop was kept.
 */

import { readFile } from 'node:fs/promises';

import type { RouteDataset, Stop } from '../src/lib/types.ts';

export const LANDMARKS_FILE = 'data/overrides/landmarks.json';

export interface LandmarkRules {
  /** Tier name → name fragments; tiers are tried in order. */
  tiers: Record<string, string[]>;
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
  const tiers = record['tiers'];
  if (typeof tiers !== 'object' || tiers === null) throw new Error(`${path}: "tiers" must be an object`);
  const rules: LandmarkRules = { tiers: {}, never: strings(record['never']), include: strings(record['include']), exclude: strings(record['exclude']) };
  for (const [tier, fragments] of Object.entries(tiers as Record<string, unknown>)) rules.tiers[tier] = strings(fragments);
  return rules;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

export interface LandmarkMatch {
  tier: string;
  /** The fragment (or listed name) that matched, for the review command. */
  fragment: string;
}

/** Why a stop counts as a landmark, or undefined when it is an ordinary stop. */
export function landmarkMatch(stop: Stop, rules: LandmarkRules): LandmarkMatch | undefined {
  const names = [stop.name.th, stop.name.en ?? ''];
  if (rules.exclude.some((name) => names.includes(name))) return undefined;
  const listed = rules.include.find((name) => names.includes(name));
  if (listed) return { tier: 'listed', fragment: listed };
  const lower = names.map((name) => name.toLowerCase());
  if (rules.never.some((fragment) => lower.some((name) => name.includes(fragment.toLowerCase())))) return undefined;
  for (const [tier, fragments] of Object.entries(rules.tiers)) {
    const fragment = fragments.find((candidate) => lower.some((name) => name.includes(candidate.toLowerCase())));
    if (fragment) return { tier, fragment };
  }
  return undefined;
}

export function landmarkTier(stop: Stop, rules: LandmarkRules): string | undefined {
  return landmarkMatch(stop, rules)?.tier;
}

/** Sets `landmark` on every stop of the dataset; returns how many per tier. */
export function tagLandmarks(dataset: RouteDataset, rules: LandmarkRules): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const stop of Object.values(dataset.stops)) {
    const tier = landmarkTier(stop, rules);
    if (tier) {
      stop.landmark = tier;
      counts[tier] = (counts[tier] ?? 0) + 1;
    } else {
      delete stop.landmark;
    }
  }
  return counts;
}
