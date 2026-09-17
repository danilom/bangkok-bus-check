import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { distanceMeters, formatDistance, nearestStop, parseLocationText } from '../src/lib/location.ts';
import type { Stop } from '../src/lib/types.ts';

describe('parseLocationText', () => {
  it('reads the position out of the common Google Maps link shapes', () => {
    assert.deepEqual(parseLocationText('https://www.google.com/maps/@13.7563,100.5018,15z'), { lat: 13.7563, lon: 100.5018 });
    assert.deepEqual(parseLocationText('https://www.google.com/maps/place/x/@13.7,100.5,17z/data=!3m1!4b1!4m6!3m5!1s0x0!8m2!3d13.7563!4d100.5018'), { lat: 13.7, lon: 100.5 });
    assert.deepEqual(parseLocationText('https://maps.google.com/?q=13.7563,100.5018'), { lat: 13.7563, lon: 100.5018 });
    assert.deepEqual(parseLocationText('https://www.google.com/maps?q=13.7563%2C100.5018'), { lat: 13.7563, lon: 100.5018 });
  });

  it('accepts a plain "lat, lon" pair', () => {
    assert.deepEqual(parseLocationText('13.7563, 100.5018'), { lat: 13.7563, lon: 100.5018 });
    assert.deepEqual(parseLocationText(' 13.7563 100.5018 '), { lat: 13.7563, lon: 100.5018 });
  });

  it('rejects text without a position or one far from Thailand', () => {
    assert.equal(parseLocationText('https://www.google.com/maps'), undefined);
    assert.equal(parseLocationText('51.5074, -0.1278'), undefined);
    assert.equal(parseLocationText(''), undefined);
  });
});

describe('nearestStop', () => {
  const stop = (id: string, lat: number, lon: number): Stop => ({ id, name: { th: id }, lat, lon });
  const stops = [stop('a', 13.700, 100.500), stop('b', 13.705, 100.500), stop('c', 13.710, 100.500)];

  it('picks the closest stop with coordinates and reports the distance', () => {
    const result = nearestStop(stops, { lat: 13.7052, lon: 100.5001 });
    assert.equal(result?.index, 1);
    assert.ok(result !== undefined && result.meters < 40);
  });

  it('ignores stops without coordinates', () => {
    const result = nearestStop([{ id: 'x', name: { th: 'x' } }, ...stops], { lat: 13.700, lon: 100.500 });
    assert.equal(result?.index, 1);
  });

  it('returns undefined when no stop has coordinates', () => {
    assert.equal(nearestStop([{ id: 'x', name: { th: 'x' } }], { lat: 13.7, lon: 100.5 }), undefined);
  });
});

describe('distance helpers', () => {
  it('measures about 111 km per degree of latitude', () => {
    const meters = distanceMeters({ lat: 13, lon: 100 }, { lat: 14, lon: 100 });
    assert.ok(Math.abs(meters - 111_195) < 200);
  });

  it('formats metres coarsely and kilometres to one decimal', () => {
    assert.equal(formatDistance(83), '80m');
    assert.equal(formatDistance(2340), '2.3km');
  });
});
