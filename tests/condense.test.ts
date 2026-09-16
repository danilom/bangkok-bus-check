import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { condenseStops } from '../src/lib/condense.ts';
import type { Stop } from '../src/lib/types.ts';

function stops(spec: string): Stop[] {
  // "o" ordinary stop, "L"/"M" major landmarks (BTS / MRT), "j" minor landmark (a junction)
  return [...spec].map((char, index) => {
    const stop: Stop = { id: `s${index}`, name: { th: `stop ${index}` } };
    if (char === 'L') stop.landmark = { tier: 'rail', rank: 'major', keyword: 'BTS' };
    if (char === 'M') stop.landmark = { tier: 'rail', rank: 'major', keyword: 'MRT' };
    if (char === 'j') stop.landmark = { tier: 'junction', rank: 'minor', keyword: 'แยก' };
    return stop;
  });
}

const shownIndexes = (segments: ReturnType<typeof condenseStops>): number[] =>
  segments.filter((s) => s.kind === 'stop').map((s) => (s.kind === 'stop' ? s.index : -1));

describe('condenseStops', () => {
  it('always keeps both termini and every landmark', () => {
    const segments = condenseStops(stops('oooLooo'));
    assert.deepEqual(shownIndexes(segments), [0, 3, 6]);
    assert.deepEqual(segments.filter((s) => s.kind === 'stop').map((s) => (s.kind === 'stop' ? s.reason : '')), ['terminus', 'rail', 'terminus']);
  });

  it('surfaces one stop per long stretch so the path never disappears', () => {
    const segments = condenseStops(stops('o'.repeat(20)), { maxGap: 6 });
    assert.deepEqual(shownIndexes(segments), [0, 7, 14, 19]);
    assert.deepEqual(segments.filter((s) => s.kind === 'gap').map((s) => (s.kind === 'gap' ? s.count : 0)), [6, 6, 4]);
  });

  it('prefers a minor landmark over an arbitrary stop when a stretch needs one', () => {
    const segments = condenseStops(stops('ooooojoooooooooo'), { maxGap: 6 });
    assert.deepEqual(shownIndexes(segments), [0, 5, 12, 15]);
    const junction = segments.find((s) => s.kind === 'stop' && s.index === 5);
    assert.equal(junction?.kind === 'stop' ? junction.reason : undefined, 'junction');
  });

  it('ignores a minor landmark that sits right after the previous shown stop', () => {
    assert.deepEqual(shownIndexes(condenseStops(stops('ojooooooooo'), { maxGap: 6 })), [0, 7, 10]);
  });

  it('hides a minor landmark when a major one already breaks the stretch', () => {
    const segments = condenseStops(stops('ojoLooo'), { maxGap: 6 });
    assert.deepEqual(shownIndexes(segments), [0, 3, 6]);
  });

  it('never hides a single stop between two shown ones', () => {
    assert.deepEqual(shownIndexes(condenseStops(stops('oLoLooo'))), [0, 1, 2, 3, 6]);
  });

  it('folds a landmark into the one right before it when both match the same keyword', () => {
    assert.deepEqual(shownIndexes(condenseStops(stops('oLLoMLo'))), [0, 1, 4, 5, 6]);
  });

  it('lets the spacing gap grow with the list so spacing adds about ten stops at most', () => {
    const segments = condenseStops(stops('o'.repeat(101)), { maxGap: 6 });
    assert.deepEqual(shownIndexes(segments), [0, 12, 24, 36, 48, 60, 72, 84, 96, 100]);
  });

  it('keeps forced stops with their reason', () => {
    const segments = condenseStops(stops('oooooooo'), { forced: new Map([[3, 'nearest'], [4, 'nearest']]) });
    const kept = segments.filter((s) => s.kind === 'stop');
    assert.deepEqual(kept.map((s) => (s.kind === 'stop' ? `${s.index}:${s.reason}` : '')), ['0:terminus', '3:nearest', '4:nearest', '7:terminus']);
  });

  it('returns a plain list when nothing needs hiding', () => {
    const segments = condenseStops(stops('oLo'));
    assert.ok(segments.every((s) => s.kind === 'stop'));
  });

  it('handles an empty list', () => {
    assert.deepEqual(condenseStops([]), []);
  });
});
