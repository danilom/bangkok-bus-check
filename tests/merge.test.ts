import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mergeRoutes, operatorKey, terminusSimilarity } from '../scripts/merge.ts';
import type { OsmRoute } from '../scripts/sources/osm.ts';
import type { WikiParseResult, WikiRoute } from '../scripts/sources/wikipedia.ts';

function wikiRow(overrides: Partial<WikiRoute> & Pick<WikiRoute, 'number'>): WikiRoute {
  return {
    aliases: [],
    unconfirmedAliases: [],
    from: 'A',
    to: 'B',
    vehicles: [],
    category: 'zone',
    line: 1,
    ...overrides,
  };
}

function osmRoute(overrides: Partial<OsmRoute> & Pick<OsmRoute, 'relationId' | 'numbers'>): OsmRoute {
  return { stops: [], ...overrides };
}

function wiki(routes: WikiRoute[], mapping: [string, string[]][] = []): WikiParseResult {
  return { routes, reformMapping: new Map(mapping), skipped: [] };
}

describe('mergeRoutes', () => {
  it('folds an OSM relation that only knows the old number onto the zone number', () => {
    const { dataset, report } = mergeRoutes(
      wiki([wikiRow({ number: '2-45', aliases: ['73'], operator: 'ขสมก.', from: 'บึงกุ่ม', to: 'สะพานพุทธ' })]),
      [osmRoute({ relationId: 1, numbers: ['73'], operator: 'BMTA', from: { th: 'บึงกุ่ม', en: 'Bueng Kum' }, to: { th: 'สะพานพุทธ', en: 'Memorial Bridge' } })],
    );
    assert.equal(dataset.routes.length, 1);
    assert.equal(dataset.routes[0]?.id, '2-45');
    assert.deepEqual(dataset.routes[0]?.sources.osmRelationIds, [1]);
    assert.deepEqual(report.folded, ['73 → 2-45 (bmta)']);
  });

  it('keeps a same-numbered route from another operator separate', () => {
    const { dataset } = mergeRoutes(
      wiki([
        wikiRow({ number: '3-1', aliases: ['2'], operator: 'บจก.ไทยสมายล์บัส', from: 'ปากน้ำ', to: 'สะพานพุทธ' }),
        wikiRow({ number: '2', operator: 'บจก.บ้านทองบัส', from: 'สำโรง', to: 'สำนักงานที่ดิน', category: 'old-licence' }),
      ]),
      [],
    );
    assert.deepEqual(dataset.routes.map((route) => route.id), ['3-1', '2']);
    assert.equal(dataset.routes[1]?.operator?.th, 'บจก.บ้านทองบัส');
  });

  it('splits an old number shared by unrelated operators into separate routes', () => {
    const { dataset, report } = mergeRoutes(
      wiki([wikiRow({ number: '5', operator: 'ขสมก.', category: 'old-licence' })]),
      [osmRoute({ relationId: 9, numbers: ['5'], operator: 'หจก.ส.ล้อเล็ก', from: { th: 'งามวงศ์วาน' }, to: { th: 'ซอยศิริชัย' } })],
    );
    assert.deepEqual(dataset.routes.map((route) => route.id), ['5', '5~2']);
    assert.deepEqual(report.split, ['5 ×2']);
  });

  it('never splits a zone number even when operator spellings differ', () => {
    const { dataset } = mergeRoutes(
      wiki([wikiRow({ number: '2-6', operator: 'บจก.บัส 33' })]),
      [osmRoute({ relationId: 3, numbers: ['2-6'], operator: 'Bus 33', from: { th: 'A' }, to: { th: 'B' } })],
    );
    assert.equal(dataset.routes.length, 1);
    assert.equal(dataset.routes[0]?.sources.wikipedia, true);
    assert.deepEqual(dataset.routes[0]?.sources.osmRelationIds, [3]);
  });

  it('confirms a single-digit alias only through the reform mapping', () => {
    const { dataset } = mergeRoutes(
      wiki(
        [
          wikiRow({ number: '3-1', unconfirmedAliases: ['2'] }),
          wikiRow({ number: '2-36', unconfirmedAliases: ['1'] }),
        ],
        [['3-1', ['2']], ['2-36', []]],
      ),
      [],
    );
    assert.deepEqual(dataset.routes.find((route) => route.id === '3-1')?.formerNumbers, ['2']);
    assert.deepEqual(dataset.routes.find((route) => route.id === '2-36')?.formerNumbers, []);
  });

  it('borrows English per terminus from any OSM direction endpoint', () => {
    const { dataset } = mergeRoutes(
      wiki([wikiRow({ number: '1-5', from: 'ตลาดรังสิต', to: 'อนุสาวรีย์ชัยสมรภูมิ' })]),
      [
        osmRoute({ relationId: 1, numbers: ['1-5'], from: { th: 'รังสิต' }, to: { th: 'อนุสาวรีย์ชัยสมรภูมิ' } }),
        osmRoute({ relationId: 2, numbers: ['1-5'], from: { th: 'อนุสาวรีย์ชัยสมรภูมิ', en: 'Victory Monument' }, to: { th: 'รังสิต', en: 'Rangsit' } }),
      ],
    );
    assert.deepEqual(dataset.routes[0]?.terminals, [
      { th: 'ตลาดรังสิต', en: 'Rangsit' },
      { th: 'อนุสาวรีย์ชัยสมรภูมิ', en: 'Victory Monument' },
    ]);
  });

  it('leaves a terminus without English when nothing resembles it', () => {
    const { dataset } = mergeRoutes(
      wiki([wikiRow({ number: '1-7E', from: 'อู่รังสิต', to: 'ศูนย์ราชการเฉลิมพระเกียรติ' })]),
      [osmRoute({ relationId: 1, numbers: ['1-7E'], from: { th: 'รังสิต', en: 'Rangsit' }, to: { th: 'สนามหลวง', en: 'Sanam Luang' } })],
    );
    assert.deepEqual(dataset.routes[0]?.terminals?.[1], { th: 'ศูนย์ราชการเฉลิมพระเกียรติ' });
  });

  it('collects stops from directions into the shared stop table', () => {
    const stop = { id: 'n1', name: { th: 'ป้าย' }, lat: 13.7, lon: 100.5 };
    const { dataset } = mergeRoutes(wiki([]), [osmRoute({ relationId: 1, numbers: ['1-1'], from: { th: 'A' }, to: { th: 'B' }, stops: [stop] })]);
    assert.deepEqual(dataset.routes[0]?.directions[0]?.stops, ['n1']);
    assert.deepEqual(dataset.stops, { n1: stop });
  });
});

describe('operatorKey', () => {
  it('collapses spellings of the two big operators', () => {
    assert.equal(operatorKey('ขสมก.'), 'bmta');
    assert.equal(operatorKey('BMTA'), 'bmta');
    assert.equal(operatorKey('บจก.ไทยสมายล์บัส (ให้บริการในนาม บจก.สมาร์ทบัส)'), 'tsb');
    assert.equal(operatorKey('smart bus'), 'tsb');
  });

  it('passes other operators through without corporate boilerplate', () => {
    assert.equal(operatorKey('บริษัท สนามบินน้ำ จำกัด'), 'สนามบินน้ำ');
  });
});

describe('terminusSimilarity', () => {
  it('sees through station prefixes and parenthesised qualifiers', () => {
    assert.equal(terminusSimilarity('BTS หมอชิต', 'สถานีรถไฟฟ้าหมอชิต'), 1);
    assert.equal(terminusSimilarity('สถานีรถไฟกรุงเทพ (หัวลำโพง)', 'หัวลำโพง'), 1);
  });

  it('keeps neighbouring but different piers apart', () => {
    assert.ok(terminusSimilarity('ท่าช้าง', 'ท่าราชวรดิฐ') < 0.5);
  });
});
