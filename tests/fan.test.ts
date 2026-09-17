import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fanLegs } from '../src/board/fan.ts';
import { bearingDegrees, pointAlong } from '../src/lib/geometry.ts';
import type { BoardStop, RouteDetail, RouteSummary } from '../src/lib/types.ts';

const summary = (id: string): RouteSummary => ({
  id, number: id, formerNumbers: [], aliases: [id], loop: false, vehicles: [],
  service: { expressway: false, night: false, extra: false, airport: false, suburban: false, van: false },
  agreement: 'agree', sources: { wikipedia: true, gtfsRouteIds: [] }, directionCount: 1,
});

/** A run through the stop at [100.5, 13.75] heading off along `shape`. */
const detail = (id: string, shape: [number, number][], stops = ['s0', 'sX', 's9']): RouteDetail => ({
  id,
  directions: [{ from: { th: 'a' }, to: { th: 'b' }, stops, tripId: 't', variant: false, shape }],
  stops: { sX: { id: 'sX', name: { th: 'x' }, lat: 13.75, lon: 100.5 } },
});

const stop: BoardStop = { id: 'sX', name: { th: 'x' }, lat: 13.75, lon: 100.5, routes: ['north', 'east', 'south'] };

describe('bearingDegrees', () => {
  it('gives north 0 and east 90', () => {
    assert.equal(Math.round(bearingDegrees([100.5, 13.75], [100.5, 13.76])), 0);
    assert.equal(Math.round(bearingDegrees([100.5, 13.75], [100.51, 13.75])), 90);
  });
});

describe('pointAlong', () => {
  it('interpolates within a segment and clamps to the end', () => {
    const line: [number, number][] = [[100.5, 13.75], [100.5, 13.76]];
    const mid = pointAlong(line, 553);
    assert.ok(mid && Math.abs(mid[1] - 13.755) < 0.0005);
    assert.deepEqual(pointAlong(line, 5000), [100.5, 13.76]);
  });
});

describe('fanLegs', () => {
  it('orders legs clockwise from north; hues start past the widest gap and stop short of a full turn', () => {
    const details = new Map<string, RouteDetail>([
      ['north', detail('north', [[100.49, 13.75], [100.5, 13.75], [100.5, 13.8]])],
      ['east', detail('east', [[100.49, 13.75], [100.5, 13.75], [100.55, 13.75]])],
      ['south', detail('south', [[100.49, 13.75], [100.5, 13.75], [100.5, 13.7]])],
    ]);
    const legs = fanLegs(stop, ['north', 'east', 'south'].map(summary), details);
    assert.deepEqual(legs.map((leg) => leg.routeId), ['north', 'east', 'south']);
    // The widest gap is south round to north (180°), so north starts the wheel; 330° shared by three.
    assert.deepEqual(legs.map((leg) => leg.hue), [0, 110, 220]);
  });

  it('starts each leg at the stop, not at the run’s origin', () => {
    const details = new Map([['north', detail('north', [[100.49, 13.75], [100.5, 13.75], [100.5, 13.8]])]]);
    const [leg] = fanLegs({ ...stop, routes: ['north'] }, [summary('north')], details);
    assert.deepEqual(leg?.coordinates[0], [100.5, 13.75]);
  });

  it('skips runs that do not call at the stop, and variants', () => {
    const passing = detail('north', [[100.49, 13.75], [100.5, 13.75], [100.5, 13.8]], ['s0', 's9']);
    const legs = fanLegs({ ...stop, routes: ['north'] }, [summary('north')], new Map([['north', passing]]));
    assert.equal(legs.length, 0);
  });
});
