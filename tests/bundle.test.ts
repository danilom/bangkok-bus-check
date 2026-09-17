import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bundleLegs, turnDegrees } from '../src/board/bundle.ts';
import type { FanLeg } from '../src/board/fan.ts';
import type { LonLat } from '../src/lib/geometry.ts';
import type { RouteDetail, RouteSummary } from '../src/lib/types.ts';

const summary = (id: string): RouteSummary => ({
  id, number: id, formerNumbers: [], aliases: [id], loop: false, vehicles: [],
  service: { expressway: false, night: false, extra: false, airport: false, suburban: false, van: false },
  agreement: 'agree', sources: { wikipedia: true, gtfsRouteIds: [] }, directionCount: 1,
});

/** Stops on a grid: the tapped stop s0, s1 a block north, then one block on each way. */
const STOPS: Record<string, LonLat> = {
  s0: [100.5, 13.75],
  s1: [100.5, 13.76],
  west: [100.49, 13.76],
  north: [100.5, 13.77],
  east: [100.51, 13.76],
  south: [100.5, 13.74],
};

/** A run through the stops named, its shape the straight lines between them. */
function run(id: string, stops: string[]): { leg: FanLeg; detail: RouteDetail } {
  const coordinates = stops.map((stop) => STOPS[stop]).filter((point): point is LonLat => point !== undefined);
  const detail: RouteDetail = {
    id,
    directions: [{ from: { th: 'a' }, to: { th: 'b' }, stops, tripId: 't', variant: false, shape: coordinates }],
    stops: Object.fromEntries(stops.map((stop) => [stop, { id: stop, name: { th: stop }, lon: STOPS[stop]?.[0] ?? 0, lat: STOPS[stop]?.[1] ?? 0 }])),
  };
  const leg: FanLeg = { routeId: id, route: summary(id), directionIndex: 0, coordinates, bearing: 0, hue: 0 };
  return { leg, detail };
}

function bundle(runs: { leg: FanLeg; detail: RouteDetail }[]): ReturnType<typeof bundleLegs> {
  return bundleLegs('s0', runs.map((r) => r.leg), new Map(runs.map((r) => [r.detail.id, r.detail])));
}

describe('turnDegrees', () => {
  it('is negative for a left turn and positive for a right turn', () => {
    assert.equal(turnDegrees(0, 270), -90);
    assert.equal(turnDegrees(0, 90), 90);
    assert.equal(turnDegrees(350, 10), 20);
  });
});

describe('bundleLegs', () => {
  it('puts the leg turning left on the left, the one going straight in the middle, the right-turner on the right', () => {
    const strands = bundle([run('B', ['s0', 's1', 'north']), run('C', ['s0', 's1', 'east']), run('A', ['s0', 's1', 'west'])]);
    const shared = strands.filter((strand) => strand.key === 's0>s1').sort((a, b) => a.slot - b.slot);
    assert.deepEqual(shared.map((strand) => strand.leg.routeId), ['A', 'B', 'C']);
    assert.deepEqual(shared.map((strand) => strand.count), [3, 3, 3]);
  });

  it('draws every member of a bundle on the same geometry', () => {
    const strands = bundle([run('B', ['s0', 's1', 'north']), run('A', ['s0', 's1', 'west'])]);
    const shared = strands.filter((strand) => strand.key === 's0>s1');
    assert.equal(shared.length, 2);
    assert.deepEqual(shared[0]?.coordinates, shared[1]?.coordinates);
  });

  it('keeps a leg on its own where no other runs its road', () => {
    const strands = bundle([run('B', ['s0', 's1', 'north']), run('S', ['s0', 'south'])]);
    const alone = strands.find((strand) => strand.leg.routeId === 'S');
    assert.equal(alone?.count, 1);
    assert.equal(alone?.slot, 0);
  });

  it('keeps the order past a divergence for the legs that stay together', () => {
    // A leaves west at s1; B and C carry on north to "north", where B is left of C because it turns west later.
    const far: Record<string, LonLat> = { ...STOPS, nw: [100.49, 13.77], ne: [100.51, 13.77] };
    Object.assign(STOPS, far);
    const strands = bundle([run('C', ['s0', 's1', 'north', 'ne']), run('A', ['s0', 's1', 'west']), run('B', ['s0', 's1', 'north', 'nw'])]);
    const first = strands.filter((strand) => strand.key === 's0>s1').sort((a, b) => a.slot - b.slot).map((strand) => strand.leg.routeId);
    const second = strands.filter((strand) => strand.key === 's1>north').sort((a, b) => a.slot - b.slot).map((strand) => strand.leg.routeId);
    assert.deepEqual(first, ['A', 'B', 'C']);
    assert.deepEqual(second, ['B', 'C']);
  });

  it('lays an express leg that skips a stop onto the bundles along its road', () => {
    // X runs s0 → north without calling at s1; its shape is the same straight road.
    const strands = bundle([run('B', ['s0', 's1', 'north']), run('C', ['s0', 's1', 'north']), run('X', ['s0', 'north'])]);
    const express = strands.filter((strand) => strand.leg.routeId === 'X').map((strand) => strand.key).sort();
    assert.deepEqual(express, ['s0>s1', 's1>north']);
    assert.equal(strands.find((strand) => strand.key === 's0>s1')?.count, 3);
  });

  it('leaves a lone leg alone when no bundle runs its road', () => {
    const strands = bundle([run('B', ['s0', 's1', 'north']), run('C', ['s0', 's1', 'north']), run('S', ['s0', 'south'])]);
    const lone = strands.filter((strand) => strand.leg.routeId === 'S');
    assert.deepEqual(lone.map((strand) => strand.key), ['s0>south']);
  });
});
