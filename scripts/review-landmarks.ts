/**
 * `bbc landmarks <route...>`: prints each direction's condensed stop list
 * with the reason every stop was kept — the exact keyword for landmarks —
 * and the size of each hidden stretch, so the keyword tiers can be judged
 * on real routes. `--all` prints every stop instead, kept ones highlighted,
 * to spot what the picker missed.
 */

import { condenseStops } from '../src/lib/condense.ts';
import type { Route, RouteDataset, Stop } from '../src/lib/types.ts';
import { fixThaiTypos } from './lib/places.ts';
import { compile, loadSources } from './build-data.ts';
import { landmarkMatch, loadLandmarkRules, tagLandmarks, type LandmarkRules } from './landmarks.ts';

export interface ReviewOptions {
  all: boolean;
  audit: boolean;
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
  if (options.audit) {
    printAudit(dataset, rules);
    return;
  }
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
    const list = direction.stops.map((stopId) => stops[stopId]).filter((s): s is Stop => s !== undefined && !s.hailAndRide);
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

/**
 * Whole-dataset numbers for judging the keyword rules: lit share per route,
 * hits per fragment, the busiest stops no rule lights (candidates to add)
 * and lit stops only one route serves (candidates to drop).
 */
function printAudit(dataset: RouteDataset, rules: LandmarkRules): void {
  const routesPerStop = new Map<string, Set<string>>();
  const shares: { id: string; lit: number; named: number }[] = [];
  const label = (route: Route, direction: Route['directions'][number]): string => `${route.id} → ${direction.to.en ?? direction.to.th}`;
  for (const route of dataset.routes) {
    for (const direction of route.directions.filter((d) => !d.variant)) {
      const list = direction.stops.map((stopId) => dataset.stops[stopId]).filter((s): s is Stop => s !== undefined && s.name.th.length > 0);
      for (const stop of list) routesPerStop.set(stop.id, (routesPerStop.get(stop.id) ?? new Set()).add(route.id));
      const lit = condenseStops(list).filter((s) => s.kind === 'stop' && s.reason !== 'terminus' && s.reason !== 'spacing').length;
      if (list.length >= 8) shares.push({ id: label(route, direction), lit, named: list.length });
    }
  }
  shares.sort((a, b) => b.lit / b.named - a.lit / a.named);
  const pct = (s: { lit: number; named: number }): string => `${Math.round((100 * s.lit) / s.named)}%`;
  console.log(style.bold(style.cyan('Lit share per direction')) + style.dim('  (landmarks shown ÷ named stops; termini and spacing excluded)'));
  const buckets = [0, 10, 20, 30, 40, 100];
  for (let i = 0; i < buckets.length - 1; i += 1) {
    const lo = buckets[i] ?? 0, hi = buckets[i + 1] ?? 100;
    const n = shares.filter((s) => (100 * s.lit) / s.named >= lo && (100 * s.lit) / s.named < hi).length;
    console.log(`  ${String(lo).padStart(3)}–${String(hi).padEnd(3)}%  ${n}`);
  }
  console.log(style.bold('  most lit:  ') + shares.slice(0, 8).map((s) => `${s.id} ${pct(s)}`).join(', '));
  console.log(style.bold('  least lit: ') + shares.slice(-8).reverse().map((s) => `${s.id} ${pct(s)}`).join(', '));

  console.log('\n' + style.bold(style.cyan('Stops per keyword')));
  const hits = new Map<string, number>();
  for (const stop of Object.values(dataset.stops)) {
    const match = landmarkMatch(stop, rules);
    if (match) hits.set(`${match.rank}/${match.tier}: ${JSON.stringify(match.fragment)}`, (hits.get(`${match.rank}/${match.tier}: ${JSON.stringify(match.fragment)}`) ?? 0) + 1);
  }
  for (const [key, n] of [...hits].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${key}`);

  const byName = new Map<string, { name: string; routes: Set<string>; lit: boolean }>();
  for (const [stopId, routes] of routesPerStop) {
    const stop = dataset.stops[stopId];
    if (!stop) continue;
    const key = fixThaiTypos(stop.name.th);
    const entry = byName.get(key) ?? { name: stop.name.en ?? stop.name.th, routes: new Set<string>(), lit: stop.landmark !== undefined };
    for (const id of routes) entry.routes.add(id);
    byName.set(key, entry);
  }
  const ranked = [...byName.values()].sort((a, b) => b.routes.size - a.routes.size);
  console.log('\n' + style.bold(style.cyan('Busiest stops no rule lights')) + style.dim('  (routes serving the stop; candidates to add)'));
  for (const entry of ranked.filter((e) => !e.lit).slice(0, 30)) console.log(`  ${String(entry.routes.size).padStart(4)}  ${entry.name}`);
  console.log('\n' + style.bold(style.cyan('Lit stops served by a single route')) + style.dim('  (candidates to drop or narrow)'));
  const single = ranked.filter((e) => e.lit && e.routes.size === 1);
  console.log(`  ${single.length} such stops; e.g. ${single.slice(0, 12).map((e) => e.name).join(', ')}`);
}

/** "junction: แยก" for keyword picks; the plain reason for the structural ones. */
function describe(stop: Stop, reason: string, rules: LandmarkRules): string {
  if (reason === 'terminus' || reason === 'nearest') return style.magenta(reason);
  if (reason === 'spacing' || reason === 'all') return style.dim(reason);
  const match = landmarkMatch(stop, rules);
  return style.green(match ? `${match.rank === 'minor' ? 'minor ' : ''}${match.tier}: ${JSON.stringify(match.fragment)}` : reason);
}
