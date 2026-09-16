import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mergeRoutes, operatorKey, terminusSimilarity } from '../scripts/merge.ts';
import type { GtfsFeed, GtfsRoute, GtfsTrip } from '../scripts/sources/gtfs.ts';
import type { WikiParseResult, WikiRoute } from '../scripts/sources/wikipedia.ts';
import type { Stop } from '../src/lib/types.ts';

let stopCounter = 0;

function stop(th: string, en?: string): Stop {
  stopCounter += 1;
  const name = en ? { th, en } : { th };
  return { id: `s${stopCounter}`, name, lat: 13.7, lon: 100.5 };
}

function trip(tripId: string, directionId: 0 | 1, stops: Stop[], headsign?: string): GtfsTrip {
  const result: GtfsTrip = { tripId, directionId, stops };
  if (headsign) result.headsign = { th: headsign };
  return result;
}

function gtfsRoute(overrides: Partial<GtfsRoute> & Pick<GtfsRoute, 'routeId' | 'numbers' | 'longName'>): GtfsRoute {
  return {
    agencyId: 'BMTA',
    agencyName: { th: 'ขสมก.', en: 'BMTA' },
    shortName: overrides.numbers.join(' '),
    trips: [],
    night: false,
    ...overrides,
  };
}

function feed(routes: GtfsRoute[]): GtfsFeed {
  return { version: 'test', routes };
}

function wikiRow(overrides: Partial<WikiRoute> & Pick<WikiRoute, 'number'>): WikiRoute {
  return { aliases: [], unconfirmedAliases: [], from: '', to: '', vehicles: [], category: 'zone', line: 1, ...overrides };
}

function wiki(routes: WikiRoute[] = [], mapping: [string, string[]][] = []): WikiParseResult {
  return { routes, reformMapping: new Map(mapping), skipped: [] };
}

const A = stop('บ้านเอื้ออาทรบึงกุ่ม', 'Buengkum');
const MID = stop('สยาม', 'Siam');
const B = stop('ท่ารถสะพานพุทธ', 'Saphan Phut Bus Station');

describe('mergeRoutes', () => {
  it('builds a route from the feed with a main run per side, decided by headsign', () => {
    const route = gtfsRoute({
      routeId: '520',
      numbers: ['2-45', '73'],
      longName: { th: 'บ้านเอื้ออาทรบึงกุ่ม - สะพานพุทธ', en: 'Buengkum - Saphan Phut' },
      trips: [trip('t1', 0, [B, MID, A], 'บ้านเอื้ออาทรบึงกุ่ม'), trip('t2', 1, [A, MID, B], 'สะพานพุทธ')],
    });
    const { dataset } = mergeRoutes(feed([route]), wiki());
    const [built] = dataset.routes;
    assert.equal(built?.id, '2-45');
    assert.deepEqual(built?.formerNumbers, ['73']);
    assert.deepEqual(built?.terminals?.map((t) => t.en), ['Buengkum', 'Saphan Phut']);
    const bySide = Object.fromEntries(built?.directions.map((d) => [d.origin, d.tripId]) ?? []);
    // t2 departs from A (Buengkum) → side 0; t1 heads to Buengkum → side 1.
    assert.deepEqual(bySide, { 0: 't2', 1: 't1' });
    assert.equal(built?.agreement, 'gtfs-only');
  });

  it('folds separate feed entries for each direction into one route', () => {
    const out = gtfsRoute({ routeId: 'a', numbers: ['ต.99'], agencyId: 'DLT', longName: { th: 'สนามหลวง - บางเขน' }, trips: [trip('t1', 0, [B, A], 'บางเขน')] });
    const back = gtfsRoute({ routeId: 'b', numbers: ['ต.99'], agencyId: 'DLT', longName: { th: 'บางเขน - สนามหลวง' }, trips: [trip('t2', 0, [A, B], 'สนามหลวง')] });
    const { dataset } = mergeRoutes(feed([out, back]), wiki());
    assert.equal(dataset.routes.length, 1);
    assert.equal(dataset.routes[0]?.service.van, true);
    assert.deepEqual(dataset.routes[0]?.directions.filter((d) => !d.variant).map((d) => d.origin).sort(), [0, 1]);
  });

  it('drops duplicate trips that repeat the same stop sequence per service day', () => {
    const route = gtfsRoute({
      routeId: '1',
      numbers: ['1-1'],
      longName: { th: 'ก - ข' },
      trips: [trip('weekday', 0, [A, B], 'ข'), trip('weekend', 0, [A, B], 'ข')],
    });
    const { dataset } = mergeRoutes(feed([route]), wiki());
    assert.equal(dataset.routes[0]?.directions.length, 1);
  });

  it('keeps an old number shared by BMTA and a private operator as two routes', () => {
    const bmta = gtfsRoute({ routeId: '1', numbers: ['5'], longName: { th: 'อู่กำแพงเพชร - สะพานพุทธ' } });
    const songthaew = gtfsRoute({ routeId: '2', numbers: ['5'], agencyId: 'DLT', longName: { th: 'งามวงศ์วาน - ซอยศิริชัย' } });
    const { dataset, report } = mergeRoutes(feed([bmta, songthaew]), wiki());
    assert.deepEqual(dataset.routes.map((r) => r.id), ['5', '5~2']);
    assert.deepEqual(report.split, ['5 ×2']);
  });

  it('attaches a Wikipedia row to the private entry with matching termini, naming the operator', () => {
    const songthaew = gtfsRoute({ routeId: '2', numbers: ['2'], agencyId: 'DLT', longName: { th: 'สำโรง - สำนักงานที่ดินกรุงเทพฯ' } });
    const row = wikiRow({ number: '2', operator: 'บจก.บ้านทองบัส', from: 'สำโรง', to: 'สำนักงานที่ดินกรุงเทพฯ', category: 'old-licence' });
    const { dataset } = mergeRoutes(feed([songthaew]), wiki([row]));
    assert.equal(dataset.routes.length, 1);
    assert.equal(dataset.routes[0]?.operator?.th, 'บจก.บ้านทองบัส');
    assert.equal(dataset.routes[0]?.agreement, 'agree');
  });

  it('fills a missing old number from the reform mapping', () => {
    const route = gtfsRoute({ routeId: '1', numbers: ['1-14E'], longName: { th: 'บางเขน - สำโรง' } });
    const { dataset } = mergeRoutes(feed([route]), wiki([], [['1-14E', ['129']]]));
    assert.deepEqual(dataset.routes[0]?.formerNumbers, ['129']);
  });

  it('flags a conflict when Wikipedia names different termini', () => {
    const route = gtfsRoute({ routeId: '1', numbers: ['1-56'], longName: { th: 'พระจอมเกล้าลาดกระบัง - หมอชิต 2' } });
    const row = wikiRow({ number: '1-56', from: 'สถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง', to: 'อนุสาวรีย์ชัยสมรภูมิ' });
    const { dataset, report } = mergeRoutes(feed([route]), wiki([row]));
    assert.equal(dataset.routes[0]?.agreement, 'conflict');
    assert.equal(report.conflict, 1);
  });

  it('keeps a Wikipedia-only route with termini and no directions', () => {
    const row = wikiRow({ number: '1063', from: 'ก', to: 'ข', category: 'suburban' });
    const { dataset } = mergeRoutes(feed([]), wiki([row]));
    assert.equal(dataset.routes[0]?.agreement, 'wikipedia-only');
    assert.deepEqual(dataset.routes[0]?.terminals?.map((t) => t.th), ['ก', 'ข']);
    assert.equal(dataset.routes[0]?.directions.length, 0);
  });

  it('models a loop route by rotation sense instead of termini', () => {
    const base = stop('ซอยหมู่บ้านบัวขาว 33');
    const route = gtfsRoute({
      routeId: '1',
      numbers: ['1-76'],
      longName: { th: 'วงกลมหมู่บ้านบัวขาว - มีนบุรี (วนซ้าย)', en: 'Circle : Bua Khao Village - Minburi (Left Loop)' },
      trips: [trip('left', 0, [base, MID, base], 'หมู่บ้านบัวขาว (วนซ้าย)'), trip('right', 0, [base, A, base], 'หมู่บ้านบัวขาว (วนขวา)')],
    });
    const { dataset } = mergeRoutes(feed([route]), wiki());
    const [built] = dataset.routes;
    assert.equal(built?.loop, true);
    assert.deepEqual(built?.terminals?.map((t) => t.en), ['Bua Khao Village', 'Minburi']);
    assert.deepEqual(Object.fromEntries(built?.directions.map((d) => [d.tripId, d.origin]) ?? []), { left: 0, right: 1 });
  });
});

describe('operatorKey', () => {
  it('collapses spellings of the two big operators and passes DLT through', () => {
    assert.equal(operatorKey('ขสมก.'), 'bmta');
    assert.equal(operatorKey('BMTA'), 'bmta');
    assert.equal(operatorKey('บจก.ไทยสมายล์บัส (ให้บริการในนาม บจก.สมาร์ทบัส)'), 'tsb');
    assert.equal(operatorKey('DLT'), 'dlt');
    assert.equal(operatorKey('บริษัท สนามบินน้ำ จำกัด'), 'สนามบินน้ำ');
  });
});

describe('terminusSimilarity', () => {
  it('treats the official synonyms of the big terminals as the same place', () => {
    assert.ok(terminusSimilarity('หมอชิต 2', 'สถานีขนส่งผู้โดยสารกรุงเทพ (จตุจักร)') >= 0.9);
    assert.ok(terminusSimilarity('สายใต้ใหม่ (ตลิ่งชัน)', 'สถานีขนส่งผู้โดยสารกรุงเทพ (ถนนบรมราชชนนี)') >= 0.9);
  });

  it('expands abbreviations and sees through station prefixes', () => {
    assert.ok(terminusSimilarity('ม.รามคำแหง 2', 'มหาวิทยาลัยรามคำแหง 2') >= 0.9);
    assert.equal(terminusSimilarity('BTS หมอชิต', 'สถานีรถไฟฟ้าหมอชิต'), 1);
  });

  it('keeps neighbouring but different piers apart', () => {
    assert.ok(terminusSimilarity('ท่าช้าง', 'ท่าราชวรดิฐ') < 0.5);
  });
});
