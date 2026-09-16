/**
 * `bbc landmarks <route...>`: prints each direction's condensed stop list
 * with the reason every stop was kept and the size of each hidden stretch,
 * so the keyword tiers can be judged on real routes before shipping.
 */

import { condenseStops } from '../src/lib/condense.ts';
import type { Route, Stop } from '../src/lib/types.ts';
import { compile, loadSources } from './build-data.ts';
import { loadLandmarkRules, tagLandmarks } from './landmarks.ts';

export async function reviewLandmarks(ids: string[]): Promise<void> {
  const sources = await loadSources();
  const { dataset } = compile(sources);
  tagLandmarks(dataset, await loadLandmarkRules());
  for (const id of ids) {
    const route = dataset.routes.find((candidate) => candidate.id === id || candidate.aliases.includes(id));
    if (!route) {
      console.log(`${id}: not found`);
      continue;
    }
    printRoute(route, dataset.stops);
  }
}

function printRoute(route: Route, stops: Record<string, Stop>): void {
  const ends = route.terminals?.map((t) => t.en ?? t.th).join(' – ') ?? '';
  console.log(`\n${route.id}  ${ends}`);
  for (const direction of route.directions.filter((d) => !d.variant)) {
    const list = direction.stops.map((stopId) => stops[stopId]).filter((s): s is Stop => s !== undefined);
    const segments = condenseStops(list);
    const shown = segments.filter((s) => s.kind === 'stop').length;
    console.log(`  → ${direction.to.en ?? direction.to.th}  (${shown} of ${list.length} stops shown)`);
    for (const segment of segments) {
      if (segment.kind === 'gap') console.log(`      · · · ${segment.count} ${segment.count === 1 ? 'stop' : 'stops'} · · ·`);
      else console.log(`    ${String(segment.index + 1).padStart(3)}. ${(segment.stop.name.en ?? segment.stop.name.th).padEnd(48)} ${segment.reason}`);
    }
  }
}
