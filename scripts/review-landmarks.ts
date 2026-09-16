/**
 * `bbc landmarks <route...>`: prints each direction's condensed stop list
 * with the reason every stop was kept — the exact keyword for landmarks —
 * and the size of each hidden stretch, so the keyword tiers can be judged
 * on real routes. `--all` prints every stop instead, kept ones highlighted,
 * to spot what the picker missed.
 */

import { condenseStops } from '../src/lib/condense.ts';
import type { Route, Stop } from '../src/lib/types.ts';
import { compile, loadSources } from './build-data.ts';
import { landmarkMatch, loadLandmarkRules, tagLandmarks, type LandmarkRules } from './landmarks.ts';

export interface ReviewOptions {
  all: boolean;
}

const style = {
  bold: (text: string): string => `\u001b[1m${text}\u001b[0m`,
  cyan: (text: string): string => `\u001b[36m${text}\u001b[0m`,
  green: (text: string): string => `\u001b[32m${text}\u001b[0m`,
  magenta: (text: string): string => `\u001b[35m${text}\u001b[0m`,
  yellow: (text: string): string => `\u001b[33m${text}\u001b[0m`,
  dim: (text: string): string => `\u001b[2m${text}\u001b[0m`,
};

export async function reviewLandmarks(ids: string[], options: ReviewOptions): Promise<void> {
  const sources = await loadSources();
  const { dataset } = compile(sources);
  const rules = await loadLandmarkRules();
  tagLandmarks(dataset, rules);
  for (const id of ids) {
    const route = dataset.routes.find((candidate) => candidate.id === id || candidate.aliases.includes(id));
    if (!route) {
      console.log(style.yellow(`${id}: not found`));
      continue;
    }
    printRoute(route, dataset.stops, rules, options);
  }
}

function printRoute(route: Route, stops: Record<string, Stop>, rules: LandmarkRules, options: ReviewOptions): void {
  const ends = route.terminals?.map((t) => t.en ?? t.th).join(' – ') ?? '';
  console.log(`\n${style.bold(style.cyan(route.id))}  ${ends}`);
  for (const direction of route.directions.filter((d) => !d.variant)) {
    const list = direction.stops.map((stopId) => stops[stopId]).filter((s): s is Stop => s !== undefined);
    const segments = condenseStops(list);
    const kept = new Map(segments.flatMap((s) => (s.kind === 'stop' ? [[s.index, s.reason] as const] : [])));
    console.log(`  ${style.bold(`→ ${direction.to.en ?? direction.to.th}`)}  ${style.dim(`(${kept.size} of ${list.length} stops shown)`)}`);
    if (options.all) {
      list.forEach((stop, index) => printStop(stop, index, kept.get(index), rules));
      continue;
    }
    for (const segment of segments) {
      if (segment.kind === 'gap') console.log(style.dim(`         · · · ${segment.count} ${segment.count === 1 ? 'stop' : 'stops'} · · ·`));
      else printStop(segment.stop, segment.index, segment.reason, rules);
    }
  }
}

function printStop(stop: Stop, index: number, reason: string | undefined, rules: LandmarkRules): void {
  const name = (stop.name.en ?? stop.name.th).padEnd(48);
  const number = String(index + 1).padStart(3);
  if (reason === undefined) {
    console.log(style.dim(`    ${number}. ${name}`));
    return;
  }
  console.log(`    ${number}. ${style.bold(name)} ${describe(stop, reason, rules)}`);
}

/** "junction: แยก" for keyword picks; the plain reason for the structural ones. */
function describe(stop: Stop, reason: string, rules: LandmarkRules): string {
  if (reason === 'terminus' || reason === 'nearest') return style.magenta(reason);
  if (reason === 'spacing' || reason === 'all') return style.dim(reason);
  const match = landmarkMatch(stop, rules);
  return style.green(match ? `${match.tier}: ${JSON.stringify(match.fragment)}` : reason);
}
