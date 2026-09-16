/**
 * Condenses a long stop list to the stops worth showing: the termini,
 * major landmarks (tagged at build time from `data/overrides/landmarks.json`),
 * stops the user is nearest to, and one stop per long stretch so the path
 * never disappears; a minor landmark (a junction, a market) is preferred
 * over an arbitrary stop when a stretch needs one. Every kept stop carries
 * the reason it was kept.
 */

import type { Stop } from './types.ts';

export type KeepReason = 'terminus' | 'nearest' | 'spacing' | string;

export type Segment =
  | { kind: 'stop'; index: number; stop: Stop; reason: KeepReason }
  | { kind: 'gap'; from: number; to: number; count: number };

export interface CondenseOptions {
  /** Indexes always shown (e.g. the nearest stops), with the reason to show. */
  forced?: Map<number, KeepReason>;
  /** Longest run of hidden stops allowed before one is shown for spacing; grows with the list, see spacingShare. */
  maxGap?: number;
  /** The gap is at least this share of the list, so spacing adds about 1/share stops however long the route. */
  spacingShare?: number;
}

const DEFAULT_MAX_GAP = 6;
const DEFAULT_SPACING_SHARE = 10;

export function condenseStops(stops: readonly Stop[], options: CondenseOptions = {}): Segment[] {
  const maxGap = Math.max(options.maxGap ?? DEFAULT_MAX_GAP, Math.ceil(stops.length / (options.spacingShare ?? DEFAULT_SPACING_SHARE)));
  const reasons = new Map<number, KeepReason>();
  const keep = (index: number, reason: KeepReason): void => {
    if (!reasons.has(index)) reasons.set(index, reason);
  };
  if (stops.length > 0) {
    keep(0, 'terminus');
    keep(stops.length - 1, 'terminus');
  }
  stops.forEach((stop, index) => {
    if (stop.landmark?.rank === 'major' && !sameLandmarkAsPrevious(stops, index)) keep(index, stop.landmark.tier);
  });
  for (const [index, reason] of options.forced ?? []) keep(index, reason);
  // Spacing: when a hidden run reaches maxGap, surface the last minor
  // landmark in the second half of the run if there is one (so the pick does
  // not bunch up against the previous shown stop), otherwise the stop at the limit.
  let lastShown = -1;
  for (let index = 0; index < stops.length; index += 1) {
    if (reasons.has(index)) {
      lastShown = index;
      continue;
    }
    if (index - lastShown > maxGap) {
      const minor = lastMinorLandmark(stops, lastShown + 1 + Math.ceil(maxGap / 2), index);
      const pick = minor ?? index;
      keep(pick, minor === undefined ? 'spacing' : (stops[pick]?.landmark?.tier ?? 'spacing'));
      lastShown = pick;
    }
  }
  return toSegments(stops, reasons);
}

/** Two exits of one station, or a stop and its opposite, match the same keyword back to back; the first stands for both. */
function sameLandmarkAsPrevious(stops: readonly Stop[], index: number): boolean {
  const previous = stops[index - 1]?.landmark;
  const current = stops[index]?.landmark;
  return previous !== undefined && current !== undefined && previous.keyword === current.keyword;
}

function lastMinorLandmark(stops: readonly Stop[], from: number, to: number): number | undefined {
  for (let index = to; index >= from; index -= 1) {
    if (stops[index]?.landmark?.rank === 'minor') return index;
  }
  return undefined;
}

function toSegments(stops: readonly Stop[], reasons: Map<number, KeepReason>): Segment[] {
  const segments: Segment[] = [];
  let hiddenFrom = -1;
  stops.forEach((stop, index) => {
    const reason = reasons.get(index);
    if (reason === undefined) {
      if (hiddenFrom === -1) hiddenFrom = index;
      return;
    }
    if (hiddenFrom !== -1) {
      segments.push({ kind: 'gap', from: hiddenFrom, to: index - 1, count: index - hiddenFrom });
      hiddenFrom = -1;
    }
    segments.push({ kind: 'stop', index, stop, reason });
  });
  return segments;
}
