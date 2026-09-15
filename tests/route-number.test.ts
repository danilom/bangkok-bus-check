import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canonicalRouteNumber, isZoneNumber, pickPrimaryNumber } from '../src/lib/route-number.ts';
import { parseRef, splitTermini } from '../scripts/sources/osm.ts';
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

  it('drops zero-width characters that leak from Wikipedia', () => {
    assert.equal(canonicalRouteNumber('120\u200B'), '120');
  });

  it('rejects text that is not a route number', () => {
    assert.equal(canonicalRouteNumber('Shuttle Bus'), undefined);
    assert.equal(canonicalRouteNumber('-'), undefined);
    assert.equal(canonicalRouteNumber('รถท่องเที่ยว 4 ตลาดน้ำ'), undefined);
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

describe('parseRef (OSM)', () => {
  it('extracts every number named in a ref', () => {
    assert.deepEqual(parseRef('73 (2-45)'), ['73', '2-45']);
    assert.deepEqual(parseRef('13 AC (3-38)'), ['13AC', '3-38']);
  });

  it('drops descriptive words and Thai branch names', () => {
    assert.deepEqual(parseRef('1009 Songthaew'), ['1009']);
    assert.deepEqual(parseRef('1096 (ถนอมมิตร)'), ['1096']);
  });
});

describe('splitTermini (OSM)', () => {
  it('strips the ref prefix and splits on the dash', () => {
    assert.deepEqual(splitTermini('73 (2-45) บ้านเอื้ออาทรบึงกุ่ม - สะพานพุทธ', '73 (2-45)'), ['บ้านเอื้ออาทรบึงกุ่ม', 'สะพานพุทธ']);
  });

  it('copes with a ref written differently in the name than in the tag', () => {
    assert.deepEqual(splitTermini('3-16E (139 ปอ.) ม.รามคำแหง 2 - อนุสาวรีย์ชัยสมรภูมิ', '3-16E (139)'), ['ม.รามคำแหง 2', 'อนุสาวรีย์ชัยสมรภูมิ']);
  });

  it('splits arrow-separated names and refuses names without two parts', () => {
    assert.deepEqual(splitTermini('3 ท่าน้ำนนท์ → บางไผ่ ซอย 5', '3'), ['ท่าน้ำนนท์', 'บางไผ่ ซอย 5']);
    assert.equal(splitTermini('เส้นทางที่ 2', '2'), undefined);
  });

  it('does not treat a ref that is only the start of a token as the ref', () => {
    assert.deepEqual(splitTermini('1-CCW วงกลม นนทบุรี - สนามบินน้ำ (วนซ้าย)', '1'), ['วงกลม นนทบุรี', 'สนามบินน้ำ (วนซ้าย)']);
  });

  it('does not split on hyphens inside a name', () => {
    assert.equal(splitTermini('เมืองทอง-แจ้งวัฒนะ', '1'), undefined);
  });
});
