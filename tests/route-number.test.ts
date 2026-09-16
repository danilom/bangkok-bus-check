import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canonicalRouteNumber, isVanNumber, isZoneNumber, pickPrimaryNumber } from '../src/lib/route-number.ts';
import { localized, parseShortName } from '../scripts/sources/gtfs.ts';
import { parseNumberCell } from '../scripts/sources/wikipedia.ts';

describe('canonicalRouteNumber', () => {
  it('unifies dash spelling and spacing', () => {
    assert.equal(canonicalRouteNumber('1 - 1'), '1-1');
    assert.equal(canonicalRouteNumber('1–2E'), '1-2E');
  });

  it('uppercases Latin suffixes and keeps Thai suffixes', () => {
    assert.equal(canonicalRouteNumber('39a'), '39A');
    assert.equal(canonicalRouteNumber('73ก'), '73ก');
    assert.equal(canonicalRouteNumber('13 AC'), '13AC');
  });

  it('accepts van numbers', () => {
    assert.equal(canonicalRouteNumber('ต.99'), 'ต.99');
    assert.equal(isVanNumber('ต.99'), true);
    assert.equal(isVanNumber('99'), false);
  });

  it('drops zero-width characters that leak from Wikipedia', () => {
    assert.equal(canonicalRouteNumber('120​'), '120');
  });

  it('rejects text that is not a route number', () => {
    assert.equal(canonicalRouteNumber('Shuttle Bus'), undefined);
    assert.equal(canonicalRouteNumber('-'), undefined);
    assert.equal(canonicalRouteNumber('รถท่องเที่ยว 4 ตลาดน้ำ'), undefined);
    assert.equal(canonicalRouteNumber('1009 Songthaew'), undefined);
  });

  it('accepts letter-prefixed airport and special routes', () => {
    assert.equal(canonicalRouteNumber('A1'), 'A1');
    assert.equal(canonicalRouteNumber('S6A'), 'S6A');
  });
});

describe('isZoneNumber / pickPrimaryNumber', () => {
  it('prefers the zone-style number as identity', () => {
    assert.equal(isZoneNumber('2-45'), true);
    assert.equal(isZoneNumber('245'), false);
    assert.equal(pickPrimaryNumber(['73', '2-45']), '2-45');
    assert.equal(pickPrimaryNumber(['554', 'S2']), 'S2');
    assert.equal(pickPrimaryNumber(['73ก']), '73ก');
  });
});

describe('parseNumberCell (Wikipedia)', () => {
  it('reads new number with old number in parentheses', () => {
    assert.deepEqual(parseNumberCell('1-2E (34E)'), { number: '1-2E', aliases: ['34E'], unconfirmedAliases: [] });
  });

  it('splits several old numbers and ignores "comparable" markers', () => {
    assert.deepEqual(parseNumberCell('1-8 (59 / 503) (3)'), { number: '1-8', aliases: ['59', '503'], unconfirmedAliases: ['3'] });
    assert.deepEqual(parseNumberCell('1-31 (523 (เทียบเคียง))'), { number: '1-31', aliases: ['523'], unconfirmedAliases: [] });
  });

  it('treats single-digit parenthesised tokens as unconfirmed', () => {
    // "3-1 (2)" really is old route 2; "2-36 (1)" is a footnote marker.
    assert.deepEqual(parseNumberCell('3-1 (2)')?.unconfirmedAliases, ['2']);
    assert.deepEqual(parseNumberCell('2-36 (1)')?.aliases, []);
  });

  it('returns undefined for non-route cells', () => {
    assert.equal(parseNumberCell('Shuttle Bus'), undefined);
  });
});

describe('parseShortName (GTFS)', () => {
  it('extracts every number in a route_short_name', () => {
    assert.deepEqual(parseShortName('2-45 (73)'), ['2-45', '73']);
    assert.deepEqual(parseShortName('1-14E'), ['1-14E']);
    assert.deepEqual(parseShortName('ต.99'), ['ต.99']);
  });

  it('ignores descriptive words', () => {
    assert.deepEqual(parseShortName('EV Bus'), []);
    assert.deepEqual(parseShortName('สายสามเสน'), []);
  });
});

describe('localized (GTFS "th;en" names)', () => {
  it('splits both languages and trims padding', () => {
    assert.deepEqual(localized('รังสิต - นครอินทร์; Rangsit -  Nakhon In'), { th: 'รังสิต - นครอินทร์', en: 'Rangsit -  Nakhon In' });
  });

  it('copes with a missing English half', () => {
    assert.deepEqual(localized('สนามหลวง'), { th: 'สนามหลวง' });
    assert.deepEqual(localized('สนามหลวง;'), { th: 'สนามหลวง' });
  });
});
