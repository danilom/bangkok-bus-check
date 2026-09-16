/**
 * Condenses a long stop list to the stops worth showing: the termini,
 * landmarks (tagged at build time from `data/overrides/landmarks.json`),
 * stops the user is nearest to, and one stop per long stretch so the path
 * never disappears. Every kept stop carries the reason it was kept.
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
    if (stop.landmark) keep(index, stop.landmark);
  });
  for (const [index, reason] of options.forced ?? []) keep(index, reason);
  // Spacing: walk the hidden runs and surface a stop every maxGap.
  let lastShown = -1;
  for (let index = 0; index < stops.length; index += 1) {
    if (reasons.has(index)) {
      lastShown = index;
      continue;
    }
    if (index - lastShown > maxGap) {
      keep(index, 'spacing');
      lastShown = index;
    }
  }
  return toSegments(stops, reasons);
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
