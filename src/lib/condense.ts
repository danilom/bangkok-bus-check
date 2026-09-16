/**
 * Condenses a long stop list to the stops worth showing: the termini,
 * major landmarks (tagged at build time from `data/overrides/landmarks.json`),
 * stops the user is nearest to, and one stop per long stretch so the path
 * never disappears; a minor landmark (a junction, a hospital) is preferred
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
  /** Longest run of hidden stops allowed before one is shown for spacing. */
  maxGap?: number;
}

const DEFAULT_MAX_GAP = 6;

export function condenseStops(stops: readonly Stop[], options: CondenseOptions = {}): Segment[] {
  const maxGap = options.maxGap ?? DEFAULT_MAX_GAP;
  const reasons = new Map<number, KeepReason>();
  const keep = (index: number, reason: KeepReason): void => {
    if (!reasons.has(index)) reasons.set(index, reason);
  };
  if (stops.length > 0) {
    keep(0, 'terminus');
    keep(stops.length - 1, 'terminus');
  }
  stops.forEach((stop, index) => {
    if (stop.landmark?.rank === 'major') keep(index, stop.landmark.tier);
  });
  for (const [index, reason] of options.forced ?? []) keep(index, reason);
  // Spacing: when a hidden run reaches maxGap, surface the last minor
  // landmark in the window if there is one, otherwise the stop at the limit.
  let lastShown = -1;
  for (let index = 0; index < stops.length; index += 1) {
    if (reasons.has(index)) {
      lastShown = index;
      continue;
    }
    if (index - lastShown > maxGap) {
      const minor = lastMinorLandmark(stops, lastShown + 1, index);
      const pick = minor ?? index;
      keep(pick, minor === undefined ? 'spacing' : (stops[pick]?.landmark?.tier ?? 'spacing'));
      lastShown = pick;
    }
  }
  return toSegments(stops, reasons);
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
