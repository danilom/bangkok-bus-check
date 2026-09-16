import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { loadTranslations, saveTranslations, type Translations } from '../scripts/lib/translations.ts';
import { mergeRoutes } from '../scripts/merge.ts';
import type { GtfsFeed, GtfsRoute } from '../scripts/sources/gtfs.ts';
import type { WikiRoute } from '../scripts/sources/wikipedia.ts';
import { applyTranslations } from '../scripts/translate.ts';

async function roundTrip(json: string): Promise<{ loaded: Translations; written: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'bbc-translations-'));
  const path = join(dir, 'translations.json');
  await writeFile(path, json, 'utf8');
  const loaded = await loadTranslations(path);
  await saveTranslations(loaded, path);
  return { loaded, written: await readFile(path, 'utf8') };
}

describe('translations file', () => {
  it('accepts the short review status and writes it back as "ok"', async () => {
    const { loaded, written } = await roundTrip('{"places":{"สนามหลวง":{"en":"Sanam Luang","status":"r"}}}');
    assert.equal(loaded.places['สนามหลวง']?.status, 'ok');
    assert.match(written, /"status": "ok"/);
  });

  it('writes drafts first, then overrides, then reviewed, one entry per line', async () => {
    const { written } = await roundTrip(JSON.stringify({
      places: {
        ก: { en: 'A', status: 'ok' },
        ข: { en: 'B', status: 'ok', override: true },
        ค: { en: '', status: 'draft' },
      },
    }));
    const order = ['ค', 'ข', 'ก'].map((th) => written.indexOf(`"${th}"`));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.equal(written.split('\n').filter((line) => line.includes('"status"')).length, 3);
  });

  it('returns empty sections for a missing file', async () => {
    const loaded = await loadTranslations(join(tmpdir(), 'does-not-exist', 'translations.json'));
    assert.deepEqual(loaded, { places: {}, operators: {} });
  });
});

function wikiRow(number: string, from: string, to: string, operator?: string): WikiRoute {
  const row: WikiRoute = { number, aliases: [], unconfirmedAliases: [], from, to, vehicles: [], category: 'suburban', line: 1 };
  if (operator) row.operator = operator;
  return row;
}

function feedWith(routes: GtfsRoute[]): GtfsFeed {
  return { version: 'test', routes };
}

function feedRoute(numbers: string[], longName: { th: string; en?: string }, headsign?: { th: string; en: string }): GtfsRoute {
  return {
    routeId: numbers[0] ?? 'x',
    agencyId: 'DLT',
    agencyName: { th: 'DLT' },
    numbers,
    shortName: numbers[0] ?? '',
    longName,
    night: false,
    trips: headsign ? [{ tripId: `t-${numbers[0]}`, directionId: 0, headsign, stops: [] }] : [],
  };
}

describe('applyTranslations', () => {
  const wiki = { routes: [wikiRow('1063', 'ท่าน้ำท่าดินแดง', 'หัวลำโพง', 'บจก.บ้านทองบัส')], reformMapping: new Map<string, string[]>(), skipped: [] };

  it('takes English from the feed when it names the same place, else from an entry, and reports the rest', () => {
    const feed = feedWith([feedRoute(['9-9'], { th: 'ก - หัวลำโพง', en: 'A - Hua Lamphong' }, { th: 'หัวลำโพง', en: 'Hua Lamphong' })]);
    const { dataset } = mergeRoutes(feed, wiki);
    const report = applyTranslations(dataset, feed, { places: {}, operators: {} });
    const route = dataset.routes.find((r) => r.id === '1063');
    assert.equal(route?.terminals?.[1].en, 'Hua Lamphong');
    assert.equal(route?.terminals?.[0].en, undefined);
    assert.deepEqual([...report.unresolvedPlaces.keys()], ['ท่าน้ำท่าดินแดง']);
    assert.deepEqual([...report.unresolvedOperators.keys()], ['บจก.บ้านทองบัส']);
  });

  it('applies entries for the rest and lets an override beat the feed', () => {
    const feed = feedWith([feedRoute(['9-9'], { th: 'ก - หัวลำโพง', en: 'A - Hua Lamphong' }, { th: 'หัวลำโพง', en: 'Head of the trumpet' })]);
    const { dataset } = mergeRoutes(feed, wiki);
    const report = applyTranslations(dataset, feed, {
      places: {
        'ท่าน้ำท่าดินแดง': { en: 'Tha Din Daeng Pier', status: 'draft' },
        'หัวลำโพง': { en: 'Hua Lamphong', status: 'ok', override: true },
      },
      operators: { 'บจก.บ้านทองบัส': { en: 'Ban Thong Bus', status: 'ok' } },
    });
    const route = dataset.routes.find((r) => r.id === '1063');
    assert.deepEqual(route?.terminals?.map((t) => t.en), ['Tha Din Daeng Pier', 'Hua Lamphong']);
    assert.equal(route?.operator?.en, 'Ban Thong Bus');
    assert.equal(report.unresolvedPlaces.size, 0);
    assert.deepEqual([...report.used.places].sort(), ['ท่าน้ำท่าดินแดง', 'หัวลำโพง']);
  });
});
