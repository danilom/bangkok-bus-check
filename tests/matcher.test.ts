import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findRoutes } from '../src/lib/matcher.ts';
import type { RouteSummary } from '../src/lib/types.ts';

function route(id: string, formerNumbers: string[] = [], extra: Partial<RouteSummary> = {}): RouteSummary {
  return {
    id,
    number: id.replace(/~\d+$/, ''),
    formerNumbers,
    aliases: [id.replace(/~\d+$/, ''), ...formerNumbers],
    service: { expressway: false, night: false, extra: false, airport: false, suburban: false, van: false },
    loop: false,
    agreement: 'agree',
    sources: { wikipedia: true, gtfsRouteIds: ['x'] },
    directionCount: 0,
    ...extra,
  };
}

const routes = [
  route('3-35', ['1']),
  route('1-1', ['29']),
  route('1-10', ['95']),
  route('110', []),
  route('2-45', ['73']),
  route('2-46', ['73ก']),
  route('73', [], { sources: { wikipedia: false, gtfsRouteIds: ['y'] } }),
  route('8', []),
  route('8E', []),
  route('80', []),
  route('800', []),
  route('1009', []),
  route('A1', []),
  route('S1', []),
  route('ต.1', []),
];

const ids = (query: string): string[] => findRoutes(routes, query).map((match) => match.route.id);

describe('findRoutes', () => {
  it('finds a zone number typed without the dash', () => {
    assert.deepEqual(ids('335'), ['3-35']);
    assert.equal(findRoutes(routes, '335')[0]?.tier, 'exact');
  });

  it('finds a route by its former number and reports which alias matched', () => {
    const [first] = findRoutes(routes, '29');
    assert.equal(first?.route.id, '1-1');
    assert.equal(first?.alias, '29');
  });

  it('offers both readings of an ambiguous dashless number, old number first', () => {
    assert.deepEqual(ids('110'), ['110', '1-10']);
  });

  it('ranks exact, then letter-suffix variants, then longer numbers', () => {
    assert.deepEqual(ids('8'), ['8', '8E', '80', '800']);
    assert.deepEqual(findRoutes(routes, '8').map((match) => match.tier), ['exact', 'variant', 'prefix', 'prefix']);
  });

  it('shows every route that carries the typed old number, documented routes first', () => {
    // 2-45 (formerly 73) is Wikipedia-backed; the bare feed-only "73" is not.
    assert.deepEqual(ids('73'), ['2-45', '73', '2-46']);
  });

  it('lists letter-prefixed routes last for a digit-only query', () => {
    const matches = findRoutes(routes, '1');
    const lettered = matches.filter((match) => match.tier === 'lettered').map((match) => match.route.id);
    assert.deepEqual(lettered, ['A1', 'S1', 'ต.1']);
    assert.equal(matches.at(-1)?.tier, 'lettered');
  });

  it('accepts dashes and lowercase letters typed on a desktop keyboard', () => {
    assert.deepEqual(ids('3-35'), ['3-35']);
    assert.deepEqual(ids('8e'), ['8E']);
  });

  it('returns nothing for blank input or an unknown number', () => {
    assert.deepEqual(ids('   '), []);
    assert.deepEqual(ids('999999'), []);
  });

  it('caps the result list', () => {
    const many = Array.from({ length: 30 }, (_, index) => route(`1${String(index).padStart(2, '0')}`));
    assert.equal(findRoutes(many, '1').length, 12);
  });
});
