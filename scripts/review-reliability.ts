/**
 * `bbc reliability`: the tiers and exclusions the board's rule produces, as
 * numbers, or the verdict on named routes — so the rule in reliability.ts
 * can be judged against routes one knows.
 */

import type { Route, RouteDataset } from '../src/lib/types.ts';
import { compile, loadSources } from './build-data.ts';
import { BOARD_TIERS, EXCLUSION_REASONS, judge, type Verdict } from './reliability.ts';

export interface ReliabilityOptions {
  /** List every route under each heading, not just the counts. */
  verbose: boolean;
}

const TIERS = ['confirmed', 'official', 'thin'] as const;

const style = {
  bold: (text: string): string => `\u001b[1m${text}\u001b[0m`,
  cyan: (text: string): string => `\u001b[36m${text}\u001b[0m`,
  green: (text: string): string => `\u001b[32m${text}\u001b[0m`,
  yellow: (text: string): string => `\u001b[33m${text}\u001b[0m`,
  dim: (text: string): string => `\u001b[2m${text}\u001b[0m`,
};

export async function reviewReliability(ids: string[], options: ReliabilityOptions): Promise<void> {
  const { dataset } = compile(await loadSources());
  if (ids.length > 0) {
    for (const id of ids) printRoute(dataset, id);
    return;
  }
  printAudit(dataset, options.verbose);
}

function printRoute(dataset: RouteDataset, id: string): void {
  const route = dataset.routes.find((candidate) => candidate.id === id || candidate.aliases.includes(id));
  if (!route) {
    console.log(style.yellow(`${id}: not found`));
    return;
  }
  console.log(`${style.bold(style.cyan(route.id))}  ${describe(route)}  ${verdictText(judge(route, dataset.stops))}`);
}

function printAudit(dataset: RouteDataset, verbose: boolean): void {
  const byVerdict = new Map<string, Route[]>();
  for (const route of dataset.routes) {
    const key = verdictKey(judge(route, dataset.stops));
    byVerdict.set(key, [...(byVerdict.get(key) ?? []), route]);
  }
  const drawn = BOARD_TIERS.reduce((sum, tier) => sum + (byVerdict.get(tier)?.length ?? 0), 0);
  console.log(`${dataset.routes.length} routes; the board draws ${style.bold(String(drawn))} (${BOARD_TIERS.join(' + ')})\n`);
  console.log(style.bold('Tiers'));
  for (const tier of TIERS) printGroup(tier, byVerdict.get(tier) ?? [], verbose, BOARD_TIERS.includes(tier) ? style.green : style.dim);
  console.log(`\n${style.bold('Excluded')}`);
  for (const reason of EXCLUSION_REASONS) printGroup(reason, byVerdict.get(reason) ?? [], verbose, style.yellow);
}

function printGroup(label: string, routes: Route[], verbose: boolean, colour: (text: string) => string): void {
  const suburban = routes.filter((route) => route.service.suburban).length;
  const detail = suburban > 0 ? style.dim(` (${routes.length - suburban} bus, ${suburban} suburban)`) : '';
  console.log(`  ${colour(label.padEnd(20))} ${String(routes.length).padStart(4)}${detail}`);
  if (!verbose) return;
  for (const route of routes) console.log(`      ${route.id.padEnd(8)} ${describe(route)}`);
}

function describe(route: Route): string {
  const ends = route.terminals?.map((end) => end.en ?? end.th).join(' – ') ?? '';
  const flags = [route.service.van && 'van', route.service.suburban && 'suburban', route.loop && 'loop'].filter(Boolean).join(', ');
  return `${ends}${flags ? style.dim(`  [${flags}]`) : ''}`;
}

function verdictKey(verdict: Verdict): string {
  return 'tier' in verdict ? verdict.tier : verdict.excluded;
}

function verdictText(verdict: Verdict): string {
  if ('tier' in verdict) return (BOARD_TIERS.includes(verdict.tier) ? style.green : style.dim)(`tier: ${verdict.tier}${BOARD_TIERS.includes(verdict.tier) ? ' (drawn)' : ' (not drawn)'}`);
  return style.yellow(`excluded: ${verdict.excluded}`);
}
